"use client";
import { Card, Eyebrow, PageHeader } from "@wbl/ui";
import { DemoDataNote } from "@wbl/ui/views";
import { journeys, screens } from "@/lib/screens";

export default function Index() {
  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-8">
      <PageHeader title="وبل · منصة المنح · النموذج الأولي" eyebrow={<Eyebrow>نسخة 0.1</Eyebrow>} description="الرحلات العشر القابلة للنقر، ببيانات توضيحية متسقة." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {journeys.map((j) => (
          <Card key={j.id}>
            <h2 className="text-h3 font-bold">{j.title}</h2>
            <p className="mb-3 text-caption text-text-muted">{j.role}</p>
            <ol className="flex flex-wrap gap-2">
              {screens.filter((s) => s.journey === j.id).map((s) => (
                <li key={s.id}><a href={`/s/${s.id}`} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-body-sm hover:border-dark-green"><span className="font-mono">{s.id}</span>{s.title}</a></li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
      <DemoDataNote />
    </main>
  );
}
