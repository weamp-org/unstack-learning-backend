import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const TIME_PATTERN = /^\d{2}:\d{2}$/;

export class CreateAvailabilityDto {
  /** Day of week, 0 (Sunday) to 6 (Saturday).
   * @example 1
   */
  @ApiProperty({ example: 1, minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  /** Window start, 24-hour HH:MM in the window's timezone.
   * @example '14:00'
   */
  @ApiProperty({ example: '14:00' })
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'startTime must be HH:MM (24-hour)',
  })
  startTime: string;

  /** Window end, 24-hour HH:MM. Must be after startTime — overnight
   * windows are not supported.
   * @example '18:00'
   */
  @ApiProperty({ example: '18:00' })
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'endTime must be HH:MM (24-hour)',
  })
  endTime: string;

  /** IANA timezone the window is expressed in.
   * @example 'Africa/Accra'
   */
  @ApiProperty({ required: false, default: 'Africa/Accra' })
  @IsString()
  @IsOptional()
  timezone?: string;
}
