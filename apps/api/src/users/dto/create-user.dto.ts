import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from "class-validator";

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsEnum(["ADMIN", "DOCTOR", "STAFF"])
  role!: "ADMIN" | "DOCTOR" | "STAFF";
}