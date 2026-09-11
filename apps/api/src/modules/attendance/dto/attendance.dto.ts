import { StudentAttendanceStatus, SessionCancellationReason } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsDateString, IsInt, Min, ValidateNested, IsArray, IsNumber } from 'class-validator';

export class MarkStudentAttendanceDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsEnum(StudentAttendanceStatus)
  status: StudentAttendanceStatus;

  @IsOptional()
  @IsDateString()
  actualStart?: string;

  @IsOptional()
  @IsDateString()
  actualEnd?: string;
}

export class BulkMarkStudentAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkStudentAttendanceDto)
  attendances: MarkStudentAttendanceDto[];
}

export class SubmitTutorClassRecordDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  tutorId: string; // The tutor teaching the class

  @IsDateString()
  scheduledStart: string;

  @IsDateString()
  scheduledEnd: string;

  @IsOptional()
  @IsDateString()
  actualStart?: string;

  @IsOptional()
  @IsDateString()
  actualEnd?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  workedMinutes?: number;

  @IsString()
  @IsOptional()
  rateGrade?: string;

  @IsString()
  @IsOptional()
  rateSubject?: string;

  @IsEnum(SessionCancellationReason)
  @IsOptional()
  cancellation?: SessionCancellationReason;

  // The student attendance recorded for this session by this tutor
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkStudentAttendanceDto)
  studentAttendances: MarkStudentAttendanceDto[];
}

export class CorrectAttendanceDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsEnum(StudentAttendanceStatus)
  studentStatus?: StudentAttendanceStatus;

  @IsOptional()
  @IsDateString()
  actualStart?: string;

  @IsOptional()
  @IsDateString()
  actualEnd?: string;
  
  @IsOptional()
  @IsInt()
  @Min(0)
  workedMinutes?: number;
}
