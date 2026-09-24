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
import type { AuthTokenPayload } from '../auth/auth-token-payload.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../shared/role.enum.js';
import {
  type BorrowerListItem,
  type BorrowerResponse,
  toBorrowerListItem,
  toBorrowerResponse,
} from './borrower-response.js';
import { BorrowersService } from './borrowers.service.js';
import { CreateBorrowerDto } from './dto/create-borrower.dto.js';
import { UpdateBorrowerDto } from './dto/update-borrower.dto.js';

@Controller('borrowers')
export class BorrowersController {
  constructor(private readonly borrowersService: BorrowersService) {}

  @Roles(Role.BackOffice)
  @Post()
  async create(
    @Body() body: CreateBorrowerDto,
    @CurrentUser() user: AuthTokenPayload,
  ): Promise<BorrowerResponse> {
    return toBorrowerResponse(await this.borrowersService.create(body), user.role);
  }

  @Get()
  async findAll(): Promise<BorrowerListItem[]> {
    const borrowers = await this.borrowersService.findAll();
    return borrowers.map(toBorrowerListItem);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthTokenPayload,
  ): Promise<BorrowerResponse> {
    return toBorrowerResponse(await this.borrowersService.findOne(id), user.role);
  }

  @Roles(Role.BackOffice)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBorrowerDto,
    @CurrentUser() user: AuthTokenPayload,
  ): Promise<BorrowerResponse> {
    return toBorrowerResponse(await this.borrowersService.update(id, body), user.role);
  }

  @Roles(Role.BackOffice)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.borrowersService.remove(id);
  }
}
