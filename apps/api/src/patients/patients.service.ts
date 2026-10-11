import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreatePatientDto } from "./dto/create-patient.dto.js";

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.patient
      .findMany({ orderBy: { createdAt: "desc" } })
      .then((patients) => ({ patients }));
  }

  create(dto: CreatePatientDto) {
    return this.prisma.patient.create({
      data: {
        name: dto.name,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        sex: dto.sex ?? null,
      },
    });
  }
}