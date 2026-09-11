import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

export interface IntegrationRequest extends Request {
  integration?: {
    id: string;
    provider: string;
  };
}

@Injectable()
export class IntegrationAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const credential = await this.prisma.integrationCredential.findFirst({
      where: {
        apiKeyHash: tokenHash,
        isActive: true,
      },
    });

    if (!credential) {
      throw new UnauthorizedException('Invalid or revoked integration token');
    }

    request.integration = {
      id: credential.id,
      provider: credential.provider,
    };

    return true;
  }
}
