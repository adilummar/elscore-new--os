"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Timeline } from '@/components/ui/Timeline';
import { getLeadTimelineAction } from '../../actions';
import { CalendarClock, FileText, UserPlus, Phone, RefreshCcw, DollarSign, BookOpen } from 'lucide-react';

function getEventIcon(type: string) {
  if (type.includes('FOLLOW_UP')) return <Phone className="w-4 h-4 text-white" />;
  if (type.includes('DEMO')) return <BookOpen className="w-4 h-4 text-white" />;
  if (type.includes('INVOICE') || type.includes('PAYMENT')) return <DollarSign className="w-4 h-4 text-white" />;
  if (type.includes('ASSIGN')) return <UserPlus className="w-4 h-4 text-white" />;
  if (type.includes('STATUS')) return <RefreshCcw className="w-4 h-4 text-white" />;
  return <FileText className="w-4 h-4 text-white" />;
}

function getEventColor(type: string) {
  if (type.includes('FOLLOW_UP')) return 'bg-blue-500';
  if (type.includes('DEMO')) return 'bg-indigo-500';
  if (type.includes('INVOICE') || type.includes('PAYMENT')) return 'bg-emerald-500';
  if (type.includes('ASSIGN')) return 'bg-purple-500';
  if (type.includes('STATUS')) return 'bg-orange-500';
  return 'bg-gray-500';
}

function formatTitle(type: string) {
  return type.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
}

export function UnifiedTimeline({ leadId }: { leadId: string }) {
  const [events, setEvents] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadTimeline() {
      try {
        const res = await getLeadTimelineAction(leadId);
        const dataArray = Array.isArray(res) ? res : res?.data;
        if (dataArray) {
          const mapped = dataArray.map((ev: any) => ({
            id: ev.id,
            title: formatTitle(ev.type),
            description: `Actor: ${ev.actor}`,
            date: new Date(ev.occurredAt),
            icon: getEventIcon(ev.type),
            color: getEventColor(ev.type)
          }));
          setEvents(mapped);
        }
      } catch (err) {
        console.error("Failed to load timeline", err);
      } finally {
        setLoading(false);
      }
    }
    loadTimeline();
  }, [leadId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-slate-500" />
          Unified Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-slate-500">Loading timeline events...</p>
        ) : (
          <Timeline>
            {events.map((ev, idx) => (
              <div key={ev.id || idx} className="mb-6 ml-6">
                <span className={`absolute flex items-center justify-center w-8 h-8 rounded-full -left-4 ring-4 ring-white ${ev.color}`}>
                  {ev.icon}
                </span>
                <h3 className="flex items-center mb-1 text-base font-semibold text-gray-900">
                  {ev.title}
                </h3>
                <time className="block mb-2 text-sm font-normal leading-none text-gray-400">
                  {ev.date.toLocaleString()}
                </time>
                <p className="mb-4 text-base font-normal text-gray-500">
                  {ev.description}
                </p>
              </div>
            ))}
          </Timeline>
        )}
      </CardContent>
    </Card>
  );
}
