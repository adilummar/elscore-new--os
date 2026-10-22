import {
  IsEnum,
  IsNotEmpty,
  IsString,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { LeaveType } from '@prisma/client';
import { isValidCalendarDate } from '../../../common/utils/calendar-date.util';

export function IsValidCalendarDateString(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidCalendarDateString',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          return isValidCalendarDate(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid real calendar date in YYYY-MM-DD format`;
        },
      },
    });
  };
}

export class CreateLeaveRequestDto {
  @IsEnum(LeaveType, { message: 'leaveType must be a valid LeaveType (CASUAL, SICK, UNPAID, OTHER)' })
  leaveType: LeaveType;

  @IsString()
  @IsValidCalendarDateString()
  startDate: string;

  @IsString()
  @IsValidCalendarDateString()
  endDate: string;

  @IsString()
  @IsNotEmpty({ message: 'reason must not be empty' })
  reason: string;
}
