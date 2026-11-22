import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Hourglass } from 'lucide-react';

/** Landing page for a Tutor Management section whose requirements have not been issued yet. */
export function PendingRequirements({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <p className="text-slate-500 text-sm mt-1">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Hourglass className="w-5 h-5 text-slate-400" aria-hidden />
            <CardTitle>Requirements pending</CardTitle>
            <Badge variant="warning">Not available yet</Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>
            This section is reserved and will be built once its requirements are provided. No data is collected or
            shown here until then.
          </p>
          <p>Recruitment work continues in Hiring.</p>
        </CardContent>
      </Card>
    </div>
  );
}
