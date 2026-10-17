import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { CreateSubjectDto } from './create-subject.dto.js';

export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {
  /** Deactivate (false) or reactivate (true) the subject. Deactivated
   * subjects are hidden from the public list but keep their history.
   * @example true
   */
  @ApiProperty({ example: true, required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
