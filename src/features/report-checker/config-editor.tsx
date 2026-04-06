'use client';

import Form from '@rjsf/shadcn';
import type { ObjectFieldTemplateProps, RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';

import type { CheckerConfig } from '@/lib/checker-config';
import schemaJson from '@/lib/checker.config.schema.json';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const schema = schemaJson as RJSFSchema;

function CollapsibleObjectTemplate(props: ObjectFieldTemplateProps) {
  const { title, properties, fieldPathId } = props;
  const id = (fieldPathId as { $id: string }).$id;

  if (id === 'root') {
    return <div className='space-y-1'>{properties.map(p => p.content)}</div>;
  }

  return (
    <div className='space-y-2'>
      <Accordion type='single' collapsible className='max-w-lg'>
        <AccordionItem value={'title'}>
          <AccordionTrigger className='px-0 pt-0 pb-2  font-semibold'>{title}</AccordionTrigger>
          <AccordionContent className='ml-2'>{properties.map(p => p.content)}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

interface Props {
  config: CheckerConfig;
  onSave: (config: CheckerConfig) => void;
}

export function ConfigEditor({ config, onSave }: Props) {
  return (
    <Form
      schema={schema}
      formData={config}
      validator={validator}
      templates={{ ObjectFieldTemplate: CollapsibleObjectTemplate }}
      onSubmit={({ formData }) => {
        if (formData) onSave(formData as CheckerConfig);
      }}
    />
  );
}
