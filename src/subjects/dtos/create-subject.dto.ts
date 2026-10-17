import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSubjectDto {
  /** Display name of the subject. Must be unique; the URL slug is derived
   * from it server-side.
   * @example 'Mathematics'
   */
  @ApiProperty({ example: 'Mathematics' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  /** Optional description shown wherever subjects are listed, e.g. to
   * clarify what the subject covers.
   * @example 'Help with algebra, geometry, and calculus'
   */
  @ApiProperty({
    example: 'Help with algebra, geometry, and calculus',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
