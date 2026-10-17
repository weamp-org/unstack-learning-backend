import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({ example: 'Mathematics' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'Help with algebra, geometry, and calculus',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
