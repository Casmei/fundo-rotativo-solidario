import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../shared/role.enum.js';
import {
  ApiAuthenticated,
  ApiBackOfficeOnly,
} from '../shared/swagger/api-authenticated.decorator.js';
import { ApiErrorResponse } from '../shared/swagger/api-error-response.decorator.js';
import { CreateLoanDto } from './dto/create-loan.dto.js';
import { LoanListItem, LoanResponse, toLoanListItem, toLoanResponse } from './loan-response.js';
import { LoansService } from './loans.service.js';

const ApiLoanIdParam = () =>
  ApiParam({ name: 'id', description: 'Identificador do empréstimo.', format: 'uuid' });
const ApiBorrowerIdParam = () =>
  ApiParam({ name: 'id', description: 'Identificador do tomador.', format: 'uuid' });
const ApiInvalidUuid = () =>
  ApiErrorResponse(
    400,
    'O `id` informado não é um UUID válido.',
    'Validation failed (uuid is expected)',
  );
const ApiLoanNotFound = () => ApiErrorResponse(404, 'Empréstimo não encontrado.', 'Loan not found');
const ApiBorrowerNotFound = () =>
  ApiErrorResponse(404, 'Tomador não encontrado.', 'Borrower not found');

@ApiTags('Loans')
@ApiAuthenticated()
@Controller()
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @ApiOperation({
    summary: 'Criar empréstimo',
    description:
      'Cria um empréstimo e suas parcelas, calculadas a partir da versão vigente do fundo. Restrito ao perfil `back_office`.',
  })
  @ApiCreatedResponse({ description: 'Empréstimo criado.', type: LoanResponse })
  @ApiErrorResponse(400, 'Corpo da requisição inválido.', [
    'borrowerId must be a UUID',
    'principalCents must be an integer number',
    'disbursedAt must be a valid calendar date in the format YYYY-MM-DD',
  ])
  @ApiBackOfficeOnly()
  @ApiErrorResponse(
    404,
    'Tomador ou fundo não encontrado (`fundId` inexistente responde com `Fund not found`).',
    'Borrower not found',
  )
  @ApiErrorResponse(
    422,
    'A versão vigente do fundo não existe, ou os termos do empréstimo violam a política do fundo ' +
      '(`installmentCount`, `graceMonths` ou `principalCents` fora dos limites da versão vigente).',
    'installmentCount must be between 1 and 10',
  )
  @Roles(Role.BackOffice)
  @Post('loans')
  async create(@Body() body: CreateLoanDto): Promise<LoanResponse> {
    return toLoanResponse(await this.loansService.create(body));
  }

  @ApiOperation({
    summary: 'Detalhar empréstimo',
    description: 'Retorna um empréstimo com suas parcelas. Disponível para todos os perfis.',
  })
  @ApiLoanIdParam()
  @ApiOkResponse({ description: 'Dados do empréstimo.', type: LoanResponse })
  @ApiInvalidUuid()
  @ApiLoanNotFound()
  @Get('loans/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<LoanResponse> {
    return toLoanResponse(await this.loansService.findOne(id));
  }

  @ApiOperation({
    summary: 'Listar empréstimos do tomador',
    description:
      'Retorna os empréstimos de um tomador, do desembolso mais recente para o mais antigo. ' +
      'Disponível para todos os perfis.',
  })
  @ApiBorrowerIdParam()
  @ApiOkResponse({ description: 'Lista de empréstimos do tomador.', type: [LoanListItem] })
  @ApiInvalidUuid()
  @ApiBorrowerNotFound()
  @Get('borrowers/:id/loans')
  async findByBorrower(@Param('id', ParseUUIDPipe) id: string): Promise<LoanListItem[]> {
    const loans = await this.loansService.findByBorrower(id);
    return loans.map(toLoanListItem);
  }
}
