import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { CreatePatientDto } from "./dto/create-patient.dto.js";
import { PatientsService } from "./patients.service.js";

@UseGuards(JwtAuthGuard)
@Controller("patients")
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  list() {
    return this.patients.list();
  }

  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }
}