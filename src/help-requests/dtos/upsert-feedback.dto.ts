import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertFeedbackDto {
  /** Session rating from 1 to 5.
   * @example 5
   */
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  /** Optional extra context about what helped.
   * @example 'Worked examples finally clicked for me.'
   */
  @ApiProperty({
    example: 'Worked examples finally clicked for me.',
    required: false,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  comment?: string;
}
