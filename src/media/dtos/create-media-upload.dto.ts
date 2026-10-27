import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MediaKind } from '../../generated/prisma/enums.js';
import {
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  MIN_AUDIO_SECONDS,
} from '../media.constants.js';

export class CreateMediaUploadDto {
  /** IMAGE or AUDIO. Video is deliberately unsupported; learners paste a
   * link instead.
   * @example 'IMAGE'
   */
  @ApiProperty({ enum: MediaKind, example: MediaKind.IMAGE })
  @IsEnum(MediaKind)
  kind: MediaKind;

  /** MIME type the browser will send with the PUT.
   * @example 'image/jpeg'
   */
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MaxLength(100)
  contentType: string;

  /** Exact size of the file in bytes. Browsers cannot be trusted with
   * anything else, and this must match the uploaded object.
   * @example 482113
   */
  @ApiProperty({ example: 482113 })
  @IsInt()
  @Min(1)
  @Max(MAX_AUDIO_BYTES)
  byteSize: number;

  /** Audio only: length in seconds, reported by the recorder. Advisory —
   * verifying it server side would mean decoding the file.
   * @example 94
   */
  @ApiProperty({ example: 94, required: false })
  @IsOptional()
  @IsInt()
  @Min(MIN_AUDIO_SECONDS)
  @Max(MAX_AUDIO_SECONDS)
  durationSeconds?: number;
}
