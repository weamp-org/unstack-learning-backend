import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

import { AvailabilityOverrideKind } from '../../generated/prisma/enums.js';

const TIME_PATTERN = /^\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateAvailabilityOverrideDto {
  /** Calendar date the exception applies to, YYYY-MM-DD in the override's
   * timezone. Must be today or later.
   * @example '2026-10-25'
   */
  @ApiProperty({ example: '2026-10-25' })
  @IsString()
  @Matches(DATE_PATTERN, {
    message: 'date must be YYYY-MM-DD',
  })
  date: string;

  /** Window start, 24-hour HH:MM in the override's timezone.
   * @example '14:00'
   */
  @ApiProperty({ example: '14:00' })
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'startTime must be HH:MM (24-hour)',
  })
  startTime: string;

  /** Window end, 24-hour HH:MM. Must be after startTime — overnight
   * overrides are not supported.
   * @example '18:00'
   */
  @ApiProperty({ example: '18:00' })
  @IsString()
  @Matches(TIME_PATTERN, {
    message: 'endTime must be HH:MM (24-hour)',
  })
  endTime: string;

  /** IANA timezone the date and times are expressed in.
   * @example 'Africa/Accra'
   */
  @ApiProperty({ required: false, default: 'Africa/Accra' })
  @IsString()
  @IsOptional()
  timezone?: string;

  /** AVAILABLE opens a normally-closed stretch; UNAVAILABLE closes a
   * normally-open one.
   * @example 'UNAVAILABLE'
   */
  @ApiProperty({ enum: AvailabilityOverrideKind })
  @IsEnum(AvailabilityOverrideKind)
  kind: AvailabilityOverrideKind;
}
