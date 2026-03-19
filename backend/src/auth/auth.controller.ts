import {
  Controller, Post, Patch, Get, Body, Param, Request, HttpCode,
  ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

class AdminCreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  role?: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() body: LoginDto) {
    const user = await this.authService.validateUser(body.email, body.password);
    const token = this.authService.generateToken(user);

    return {
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Register new user (pending admin approval)' })
  async register(@Body() body: RegisterDto) {
    try {
      await this.authService.createUser(body.email, body.password, body.name, 'analyst', {
        pendingApproval: true,
      });
      return { message: 'Cadastro realizado. Aguardando aprovação do administrador.' };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Erro ao cadastrar');
    }
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user info' })
  me(@Request() req: any) {
    return {
      id: req.user.sub,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
    };
  }

  @Patch('password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(@Request() req: any, @Body() body: ChangePasswordDto) {
    await this.authService.changePassword(req.user.sub, body.currentPassword, body.newPassword);
    return { message: 'Senha alterada com sucesso.' };
  }

  // --- Admin endpoints ---

  @Get('users')
  @ApiOperation({ summary: 'List all users (admin only)' })
  async listUsers(@Request() req: any) {
    this.requireAdmin(req);
    return this.authService.listUsers();
  }

  @Patch('users/:id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve pending user (admin only)' })
  async approveUser(@Request() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    await this.authService.approveUser(id);
    this.logger.log(`User ${id} approved by ${req.user.email}`);
    return { message: 'Usuário aprovado.' };
  }

  @Patch('users/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject pending user (admin only)' })
  async rejectUser(@Request() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    await this.authService.rejectUser(id);
    this.logger.log(`User ${id} rejected by ${req.user.email}`);
    return { message: 'Usuário rejeitado.' };
  }

  @Patch('users/:id/toggle')
  @HttpCode(200)
  @ApiOperation({ summary: 'Toggle user active status (admin only)' })
  async toggleUser(@Request() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    const active = await this.authService.toggleUserActive(id);
    return { message: active ? 'Usuário ativado.' : 'Usuário desativado.', active };
  }

  @Post('users')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create user directly (admin only)' })
  async createUser(@Request() req: any, @Body() body: AdminCreateUserDto) {
    this.requireAdmin(req);
    try {
      const role = body.role || 'analyst';
      const created = await this.authService.createUser(body.email, body.password, body.name, role);
      this.logger.log(`User ${body.email} created by ${req.user.email}`);
      return { message: 'Usuário criado com sucesso.', id: created._id };
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Erro ao criar usuário');
    }
  }

  private requireAdmin(req: any): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Acesso restrito a administradores');
    }
  }
}
