import { IsOptional, IsString } from 'class-validator';
export class UpdateSalesNoteDto {
  @IsString() @IsOptional() content?: string;
}
