import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import type { JwtSignOptions } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service.js";
import type { LoginDto } from "./dto/login.dto.js";
import type { RegisterDto } from "./dto/register.dto.js";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException("Email already registered");

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, role: "STAFF" },
    });
    return this.issueTokens(user.id, user.email, user.role);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid credentials");

    return this.issueTokens(user.id, user.email, user.role);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; email: string; role: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException("Invalid refresh token");

    return this.issueTokens(user.id, user.email, user.role);
  }

  private async issueTokens(
    sub: string,
    email: string,
    role: string,
  ): Promise<TokenPair> {
    const accessTtl = (process.env.JWT_ACCESS_TTL ??
      "15m") as JwtSignOptions["expiresIn"];
    const refreshTtl = (process.env.JWT_REFRESH_TTL ??
      "7d") as JwtSignOptions["expiresIn"];
    // `jti` makes every issued token unique so a refresh genuinely rotates the
    // pair (without it, two tokens minted in the same second with the same
    // payload were byte-for-byte identical).
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub, email, role, jti: randomUUID() },
        {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: accessTtl,
        },
      ),
      this.jwt.signAsync(
        { sub, email, role, jti: randomUUID() },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: refreshTtl,
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}