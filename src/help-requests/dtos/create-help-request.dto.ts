import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class HelpLinkInput {
  /** Link to a page or video that shows the struggle.
   * @example 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
   */
  @ApiProperty({ example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  url: string;

  /** What the teacher should look at, e.g. a timestamp.
   * @example 'Lost at 6:12'
   */
  @ApiProperty({ required: false, example: 'Lost at 6:12' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  label?: string;
}

export class CreateHelpRequestDto {
  /** Subject the learner needs help with. Must be active.
   * @example 'cmvc63mnq0003wiijf1mhqn2h'
   */
  @ApiProperty({ example: 'cmvc63mnq0003wiijf1mhqn2h' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  /** Short title naming the struggle.
   * @example 'Integration by parts keeps failing'
   */
  @ApiProperty({ example: 'Integration by parts keeps failing' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  topic: string;

  /** Free-form context (Markdown supported). At least one of details or
   * links is required.
   * @example 'I can do u-substitution but LIATE ordering confuses me…'
   */
  @ApiProperty({
    required: false,
    example: 'I can do u-substitution but LIATE ordering confuses me…',
  })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  details?: string;

  /** Context links (max 3).
   */
  @ApiProperty({ type: [HelpLinkInput], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HelpLinkInput)
  @ArrayMaxSize(3)
  @IsOptional()
  links?: HelpLinkInput[];
}
