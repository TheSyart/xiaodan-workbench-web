import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { CalendarItem } from '@xiaodan/contracts';
import { api, patch, post } from '../api.js';
import { PageHeader } from '../components/common/PageHeader.js';

export function CalendarPage() {
  const client = useQueryClient();
  const range = useMemo(() => {
    const date = new Date();
    const from = new Date(date.getFullYear(), date.getMonth() - 1, 1).toISOString();
    const to = new Date(date.getFullYear(), date.getMonth() + 2, 1).toISOString();
    return { from, to };
  }, []);

  const items = useQuery({
    queryKey: ['calendar', range],
    queryFn: () =>
      api<CalendarItem[]>(
        `/calendar/items?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
      )
  });

  const create = useMutation({
    mutationFn: (body: unknown) => post('/calendar/items', body),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['calendar'] })
  });

  const update = useMutation({
    mutationFn: ({
      item,
      startsAt,
      endsAt
    }: {
      item: CalendarItem;
      startsAt: string;
      endsAt: string;
    }) => patch(`/calendar/items/${item.id}`, { startsAt, endsAt }, item.version),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['calendar'] }),
    onError: () => void client.invalidateQueries({ queryKey: ['calendar'] })
  });

  return (
    <div className="page calendar-page">
      <PageHeader
        eyebrow="CALENDAR"
        title="让时间有形状"
        description="拖动调整开始时间，拉伸改变长度；每次移动都受版本保护。"
      />

      <section className="calendar-paper">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          locale="zh-cn"
          firstDay={1}
          slotMinTime="07:00:00"
          slotMaxTime="23:00:00"
          slotDuration="00:15:00"
          snapDuration="00:15:00"
          editable
          selectable
          height="auto"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
          }}
          events={(items.data ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            start: item.startsAt,
            end: item.endsAt,
            allDay: item.allDay,
            extendedProps: { item }
          }))}
          select={(selection) =>
            create.mutate({
              kind: 'event',
              title: '新事项',
              startsAt: selection.start.toISOString(),
              endsAt: selection.end.toISOString(),
              allDay: selection.allDay,
              projectId: null,
              taskId: null,
              scriptId: null
            })
          }
          eventDrop={(info) => {
            const item = info.event.extendedProps.item as CalendarItem;
            update.mutate(
              {
                item,
                startsAt: info.event.start!.toISOString(),
                endsAt: (
                  info.event.end ?? new Date(info.event.start!.getTime() + 3600000)
                ).toISOString()
              },
              { onError: () => info.revert() }
            );
          }}
          eventResize={(info) => {
            const item = info.event.extendedProps.item as CalendarItem;
            update.mutate(
              {
                item,
                startsAt: info.event.start!.toISOString(),
                endsAt: info.event.end!.toISOString()
              },
              { onError: () => info.revert() }
            );
          }}
        />
      </section>
    </div>
  );
}
