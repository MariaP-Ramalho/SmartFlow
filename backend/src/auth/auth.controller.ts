import { Controller, Post, Body, Get, Request, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsEmail } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
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
}
