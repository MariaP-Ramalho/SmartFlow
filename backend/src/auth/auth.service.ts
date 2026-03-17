import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    this.jwtSecret = this.config.get<string>('jwt.secret', 'default-dev-secret');
  }

  async validateUser(email: string, password: string): Promise<UserDocument> {
    const user = await this.userModel.findOne({ email: email.toLowerCase(), active: true });
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const hash = this.hashPassword(password, user.salt);
    if (hash !== user.passwordHash) throw new UnauthorizedException('Credenciais inválidas');

    return user;
  }

  generateToken(user: UserDocument): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
      }),
    ).toString('base64url');

    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }

  verifyToken(token: string): { sub: string; email: string; name: string; role: string } | null {
    try {
      const [header, payload, signature] = token.split('.');
      const expected = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(`${header}.${payload}`)
        .digest('base64url');

      if (signature !== expected) return null;

      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;

      return data;
    } catch {
      return null;
    }
  }

  async createUser(email: string, password: string, name: string, role = 'analyst'): Promise<UserDocument> {
    const existing = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existing) throw new Error('Usuário já existe');

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(password, salt);

    return this.userModel.create({
      email: email.toLowerCase(),
      name,
      role,
      salt,
      passwordHash,
      active: true,
    });
  }

  async seedDefaultUser(): Promise<void> {
    const count = await this.userModel.countDocuments();
    if (count === 0) {
      const defaultEmail = this.config.get<string>('ADMIN_EMAIL', 'admin@resolve.com');
      const defaultPassword = this.config.get<string>('ADMIN_PASSWORD', 'admin123');
      await this.createUser(defaultEmail, defaultPassword, 'Administrador', 'admin');
    }
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  }
}
