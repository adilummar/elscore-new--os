import { IsNotEmpty, IsString } from 'class-validator';

export class CreateSalesNoteDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}
