/**
 * EmployeeCheckedOutEvent — fired by the Attendance module when a Sales employee checks out.
 *
 * CRM listens to this event to send a consolidated notification to the Sales Head
 * if the employee has incomplete Follow-ups due that day.
 *
 * The Attendance module owns the Check-In/Check-Out lifecycle.
 * CRM only reacts to it. Do NOT implement Attendance functionality in CRM.
 *
 * Event name: 'employee.checked-out'
 */
export interface EmployeeCheckedOutPayload {
  /** Employee business ID (e.g. EMP-0001) */
  employeeId: string;
  /** User account ID linked to the employee */
  userId: string;
  /** UTC timestamp of check-out */
  checkedOutAt: Date;
}
