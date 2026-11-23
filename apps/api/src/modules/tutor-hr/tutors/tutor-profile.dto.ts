import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

import { GENDERS, MARITAL_STATUSES, TUTOR_STATUSES } from './tutor-profile-rules';

/** In AddressDto and BankDto, null clears a field and an omitted field is left unchanged. */
export class AddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) house?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) village?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) district?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z0-9 -]{3,12}$/, { message: 'PIN code is invalid' }) pin?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) state?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) country?: string | null;
}

export class BankDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) accountHolder?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) bank?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) branch?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[0-9]{6,20}$/, { message: 'Account number must be 6 to 20 digits' }) accountNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, { message: 'IFSC must look like ABCD0123456' }) ifsc?: string | null;
}

export class EmergencyContactDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiProperty() @IsString() @MinLength(4) @MaxLength(30) phone!: string;
  @ApiPropertyOptional({ default: '+91' }) @IsOptional() @IsString() countryCode?: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) relationship!: string;
}

export class UpdateTutorProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional({ enum: GENDERS }) @IsOptional() @IsIn([...GENDERS]) gender?: (typeof GENDERS)[number];
  @ApiPropertyOptional({ enum: MARITAL_STATUSES }) @IsOptional() @IsIn([...MARITAL_STATUSES]) maritalStatus?: (typeof MARITAL_STATUSES)[number];
  @ApiPropertyOptional({ type: AddressDto }) @IsOptional() @ValidateNested() @Type(() => AddressDto) permanentAddress?: AddressDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() currentSameAsPermanent?: boolean;
  @ApiPropertyOptional({ type: AddressDto }) @IsOptional() @ValidateNested() @Type(() => AddressDto) currentAddress?: AddressDto;
  @ApiPropertyOptional({ type: BankDto }) @IsOptional() @ValidateNested() @Type(() => BankDto) bank?: BankDto;
  @ApiPropertyOptional({ type: EmergencyContactDto }) @IsOptional() @ValidateNested() @Type(() => EmergencyContactDto) primaryContact?: EmergencyContactDto;
  /** Send null to remove the optional second contact. */
  @ApiPropertyOptional({ type: EmergencyContactDto, nullable: true }) @IsOptional() @ValidateNested() @Type(() => EmergencyContactDto) secondaryContact?: EmergencyContactDto | null;
}

const thisYear = new Date().getFullYear();
export class QualificationDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) institution!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(thisYear + 1) yearOfCompletion?: number;
}

export class ChangeTutorStatusDto {
  @ApiProperty({ enum: TUTOR_STATUSES }) @IsIn([...TUTOR_STATUSES]) status!: (typeof TUTOR_STATUSES)[number];
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

export class HrNoteDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(5000) body!: string;
}

export class ListTutorsQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: TUTOR_STATUSES }) @IsOptional() @IsIn([...TUTOR_STATUSES]) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() gradeId?: string;
  /** Minimum English communication rating (1-5) from the demo evaluation. */
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) minEnglishRating?: number;
  /** Verification (joined) date range, YYYY-MM-DD. */
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: ['verifiedAt', 'name', 'tutorCode'] }) @IsOptional() @IsIn(['verifiedAt', 'name', 'tutorCode']) sortBy?: 'verifiedAt' | 'name' | 'tutorCode';
  @ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsIn(['asc', 'desc']) sortDir?: 'asc' | 'desc';
}

export class SummaryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}
