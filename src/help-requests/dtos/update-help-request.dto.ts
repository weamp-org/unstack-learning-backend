import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { HelpLinkInput } from './create-help-request.dto.js';

export class UpdateHelpRequestDto {
  /** Curriculum topic within the subject.
   * @example 'Differentiation'
   */
  @ApiProperty({ example: 'Differentiation', required: false })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @IsOptional()
  topic?: string;

  /** Free-form context (Markdown supported).
   * @example 'I can do u-substitution but LIATE ordering confuses me…'
   */
  @ApiProperty({
    example: 'I can do u-substitution but LIATE ordering confuses me…',
    required: false,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @IsOptional()
  details?: string;

  /** Replacement context links (max 3). Replaces all existing links.
   */
  @ApiProperty({ type: [HelpLinkInput], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HelpLinkInput)
  @ArrayMaxSize(3)
  @IsOptional()
  links?: HelpLinkInput[];
}
