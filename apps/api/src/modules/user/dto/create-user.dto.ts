import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ description: 'User email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Employee first name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ description: 'Employee last name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ description: 'Department ID for the employee' })
  @IsUUID()
  @IsNotEmpty()
  departmentId: string;

  @ApiProperty({ description: 'Initial role ID for the user' })
  @IsUUID()
  @IsNotEmpty()
  roleId: string;

  @ApiProperty({ description: 'Initial password to be hashed' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
