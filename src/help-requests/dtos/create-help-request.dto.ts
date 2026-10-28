import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { MAX_MEDIA_PER_REQUEST } from '../../media/media.constants.js';

export class HelpLinkInput {
  /** Link to a page or video that shows the struggle.
   * @example 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
   */
  @ApiProperty({ example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  url: string;
}

export class CreateHelpRequestDto {
  /** Subject the learner needs help with. Must be active.
   * @example 'cmvc63mnq0003wiijf1mhqn2h'
   */
  @ApiProperty({ example: 'cmvc63mnq0003wiijf1mhqn2h' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  /** Curriculum topic within the subject.
   * @example 'Differentiation'
   */
  @ApiProperty({ example: 'Differentiation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  topic: string;

  /** Free-form context (Markdown supported). Optional: context can also come
   * from links, images, or a voice note — at least one is required, and audio
   * always needs a written summary.
   * @example 'I can do u-substitution but LIATE ordering confuses me…'
   */
  @ApiProperty({
    example: 'I can do u-substitution but LIATE ordering confuses me…',
    required: false,
  })
  @IsString()
  @MaxLength(5000)
  @IsOptional()
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

  /** Uploads completed through /media/uploads and not yet attached to a
   * request (max 5, of which at most 2 audio).
   */
  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_MEDIA_PER_REQUEST)
  @IsString({ each: true })
  @IsOptional()
  mediaIds?: string[];
}
