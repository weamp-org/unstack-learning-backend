import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetTeacherSubjectsDto {
  /** Complete replacement set of subject IDs the teacher can help with.
   * Empty clears all. Duplicates are rejected.
   * @example ['cmvc63mnq0003wiijf1mhqn2h']
   */
  @ApiProperty({ type: [String], example: ['cmvc63mnq0003wiijf1mhqn2h'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  subjectIds: string[];
}
