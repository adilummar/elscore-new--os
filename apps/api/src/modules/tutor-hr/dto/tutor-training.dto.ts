import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TutorLeadAttendance, TutorLeadTaskStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateTutorLeadTrainingDto {
  @ApiProperty()
  @IsString()
  sessionDate: string; // YYYY-MM-DD

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiProperty({ enum: TutorLeadAttendance })
  @IsEnum(TutorLeadAttendance)
  attendanceStatus: TutorLeadAttendance;

  @ApiProperty({ enum: TutorLeadTaskStatus })
  @IsEnum(TutorLeadTaskStatus)
  taskStatus: TutorLeadTaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdateTutorLeadTrainingDto extends CreateTutorLeadTrainingDto {}
