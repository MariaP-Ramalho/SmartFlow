import { Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { User, UserSchema } from './schemas/user.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    const secret = this.config.get<string>('jwt.secret', '');
    if (nodeEnv === 'production' && (!secret || secret.length < 32 || secret.includes('default') || secret.includes('your-'))) {
      throw new Error(
        'JWT_SECRET inválido em produção. Defina um segredo forte (mín. 32 caracteres) no .env',
      );
    }
    await this.authService.seedDefaultUser();
  }
}
