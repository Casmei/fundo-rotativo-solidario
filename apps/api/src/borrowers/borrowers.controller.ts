import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthTokenPayload } from '../auth/auth-token-payload.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../shared/role.enum.js';
import {
  ApiAuthenticated,
  ApiBackOfficeOnly,
} from '../shared/swagger/api-authenticated.decorator.js';
import { ApiErrorResponse } from '../shared/swagger/api-error-response.decorator.js';
import {
  BorrowerListItem,
  BorrowerResponse,
  toBorrowerListItem,
  toBorrowerResponse,
} from './borrower-response.js';
import { BorrowersService } from './borrowers.service.js';
import { CreateBorrowerDto } from './dto/create-borrower.dto.js';
import { UpdateBorrowerDto } from './dto/update-borrower.dto.js';

const ApiBorrowerIdParam = () =>
  ApiParam({ name: 'id', description: 'Identificador do tomador.', format: 'uuid' });
const ApiInvalidBorrowerId = () =>
  ApiErrorResponse(
    400,
    'O `id` informado não é um UUID válido.',
    'Validation failed (uuid is expected)',
  );
const ApiBorrowerNotFound = () =>
  ApiErrorResponse(404, 'Tomador não encontrado.', 'Borrower not found');
const ApiDuplicateCpf = () =>
  ApiErrorResponse(
    409,
    'Já existe um tomador com este CPF.',
    'Borrower with this CPF already exists',
  );

@ApiTags('Borrowers')
@ApiAuthenticated()
@Controller('borrowers')
export class BorrowersController {
  constructor(private readonly borrowersService: BorrowersService) {}

  @ApiOperation({
    summary: 'Cadastrar tomador',
    description: 'Cria um novo tomador. Restrito ao perfil `back_office`.',
  })
  @ApiCreatedResponse({ description: 'Tomador cadastrado.', type: BorrowerResponse })
  @ApiErrorResponse(400, 'Corpo da requisição inválido.', [
    'name should not be empty',
    'cpf must be a valid CPF',
  ])
  @ApiBackOfficeOnly()
  @ApiDuplicateCpf()
  @Roles(Role.BackOffice)
  @Post()
  async create(
    @Body() body: CreateBorrowerDto,
    @CurrentUser() user: AuthTokenPayload,
  ): Promise<BorrowerResponse> {
    return toBorrowerResponse(await this.borrowersService.create(body), user.role);
  }

  @ApiOperation({
    summary: 'Listar tomadores',
    description: 'Retorna todos os tomadores, ordenados por nome. Disponível para todos os perfis.',
  })
  @ApiOkResponse({ description: 'Lista de tomadores.', type: [BorrowerListItem] })
  @Get()
  async findAll(): Promise<BorrowerListItem[]> {
    const borrowers = await this.borrowersService.findAll();
    return borrowers.map(toBorrowerListItem);
  }

  @ApiOperation({
    summary: 'Detalhar tomador',
    description:
      'Retorna os dados de um tomador. O CPF só é incluído na resposta para o perfil `back_office`.',
  })
  @ApiBorrowerIdParam()
  @ApiOkResponse({ description: 'Dados do tomador.', type: BorrowerResponse })
  @ApiInvalidBorrowerId()
  @ApiBorrowerNotFound()
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
  ): Promise<BorrowerResponse> {
    return toBorrowerResponse(await this.borrowersService.findOne(id), user.role);
  }

  @ApiOperation({
    summary: 'Atualizar tomador',
    description:
      'Atualiza parcialmente um tomador: apenas os campos enviados são alterados, e `null` não é aceito. ' +
      'Restrito ao perfil `back_office`.',
  })
  @ApiBorrowerIdParam()
  @ApiOkResponse({ description: 'Tomador atualizado.', type: BorrowerResponse })
  @ApiErrorResponse(400, '`id` ou corpo da requisição inválido.', ['cpf must be a valid CPF'])
  @ApiBackOfficeOnly()
  @ApiBorrowerNotFound()
  @ApiDuplicateCpf()
  @Roles(Role.BackOffice)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBorrowerDto,
    @CurrentUser() user: AuthTokenPayload,
  ): Promise<BorrowerResponse> {
    return toBorrowerResponse(await this.borrowersService.update(id, body), user.role);
  }

  @ApiOperation({
    summary: 'Remover tomador',
    description: 'Remove um tomador permanentemente. Restrito ao perfil `back_office`.',
  })
  @ApiBorrowerIdParam()
  @ApiNoContentResponse({ description: 'Tomador removido.' })
  @ApiInvalidBorrowerId()
  @ApiBackOfficeOnly()
  @ApiBorrowerNotFound()
  @ApiErrorResponse(
    409,
    'O tomador possui empréstimos e não pode ser removido.',
    'Borrower has loans',
  )
  @Roles(Role.BackOffice)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.borrowersService.remove(id);
  }
}
