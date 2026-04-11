import { useRef } from 'react';
import { genId } from '../../lib/ids';
import SectionHeader from './ui/SectionHeader';
import FormCard from './ui/FormCard';
import TwoColumnGrid from './ui/TwoColumnGrid';

function ScopeList({
  title,
  items,
  listKey,
  onAdd,
  onRemove,
  onTextChange,
  onDragStart,
  onDragOver,
  onDrop,
  color,
}) {
  return (
    <div
      style={{ flex: 1, minWidth: 0 }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(listKey);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(listKey);
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--spacing-md)',
        }}
      >
        <h3 className="font-semibold" style={{ color }}>
          {title}
          <span
            className="text-sm font-normal text-secondary"
            style={{ marginLeft: 'var(--spacing-sm)' }}
          >
            ({items.length})
          </span>
        </h3>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}
          onClick={() => onAdd(listKey)}
        >
          + Add
        </button>
      </div>

      <div
        style={{
          minHeight: '180px',
          border: '2px dashed var(--color-border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-sm)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        {items.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: 'var(--font-size-sm)',
              textAlign: 'center',
              padding: 'var(--spacing-lg)',
            }}
          >
            Drag items here or click "+ Add"
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => onDragStart(item.id, listKey)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--spacing-sm)',
              backgroundColor: 'var(--color-bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-sm)',
              cursor: 'grab',
              border: '1px solid var(--color-border-default)',
            }}
          >
            <span
              style={{
                color: 'var(--color-text-tertiary)',
                fontSize: '16px',
                userSelect: 'none',
                flexShrink: 0,
                paddingTop: '2px',
              }}
            >
              ⠿
            </span>
            <textarea
              className="form-textarea"
              value={item.text}
              onChange={(e) => onTextChange(listKey, item.id, e.target.value)}
              placeholder="Describe scope item..."
              rows={2}
              style={{ flex: 1, marginBottom: 0, resize: 'none', fontSize: 'var(--font-size-sm)' }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => onRemove(listKey, item.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '2px 4px',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CloudAdoptionScope({ data, onChange }) {
  const dragItem = useRef(null);
  const dragSource = useRef(null);

  const inScope = data?.inScope ?? [];
  const outOfScope = data?.outOfScope ?? [];
  const cloudObjectives = data?.cloudObjectives ?? '';
  const targetEnvironment = data?.targetEnvironment ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  const handleAdd = (listKey) => {
    const newItem = { id: genId('item'), text: '' };
    if (listKey === 'inScope') update({ inScope: [...inScope, newItem] });
    else update({ outOfScope: [...outOfScope, newItem] });
  };

  const handleRemove = (listKey, id) => {
    if (listKey === 'inScope') update({ inScope: inScope.filter((i) => i.id !== id) });
    else update({ outOfScope: outOfScope.filter((i) => i.id !== id) });
  };

  const handleTextChange = (listKey, id, text) => {
    if (listKey === 'inScope')
      update({ inScope: inScope.map((i) => (i.id === id ? { ...i, text } : i)) });
    else update({ outOfScope: outOfScope.map((i) => (i.id === id ? { ...i, text } : i)) });
  };

  const handleDragStart = (id, sourceList) => {
    dragItem.current = id;
    dragSource.current = sourceList;
  };

  const handleDrop = (targetList) => {
    const id = dragItem.current;
    const source = dragSource.current;
    if (!id || source === targetList) {
      dragItem.current = null;
      dragSource.current = null;
      return;
    }

    let sourceArr = source === 'inScope' ? [...inScope] : [...outOfScope];
    let targetArr = targetList === 'inScope' ? [...inScope] : [...outOfScope];
    const idx = sourceArr.findIndex((i) => i.id === id);
    if (idx === -1) {
      dragItem.current = null;
      dragSource.current = null;
      return;
    }

    const [moved] = sourceArr.splice(idx, 1);
    targetArr.push(moved);

    update({
      inScope: source === 'inScope' ? sourceArr : targetArr,
      outOfScope: source === 'outOfScope' ? sourceArr : targetArr,
    });
    dragItem.current = null;
    dragSource.current = null;
  };

  return (
    <div>
      <SectionHeader
        title="Cloud Adoption Scope"
        description="Define the cloud adoption objectives, target environment, and what workloads and services are in and out of scope for this engagement."
      />

      {/* Cloud Objectives */}
      <TwoColumnGrid style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <FormCard
          title="Cloud Objectives"
          description="Describe the business and technical goals driving the cloud adoption."
        >
          <textarea
            className="form-textarea"
            value={cloudObjectives}
            onChange={(e) => update({ cloudObjectives: e.target.value })}
            placeholder="e.g. Reduce on-premises infrastructure costs by 40%, improve scalability for seasonal workloads, enable disaster recovery capabilities..."
            rows={6}
          />
        </FormCard>

        <FormCard
          title="Target Environment"
          description="Describe the target Azure environment — subscriptions, regions, landing zones, and governance model."
        >
          <textarea
            className="form-textarea"
            value={targetEnvironment}
            onChange={(e) => update({ targetEnvironment: e.target.value })}
            placeholder="e.g. Azure landing zone in Australia East (primary) and Australia Southeast (DR), three subscriptions (Production, Non-Prod, Shared Services)..."
            rows={6}
          />
        </FormCard>
      </TwoColumnGrid>

      {/* Scope Lists */}
      <TwoColumnGrid>
        <ScopeList
          title="In Scope"
          items={inScope}
          listKey="inScope"
          color="var(--color-success)"
          onAdd={handleAdd}
          onRemove={handleRemove}
          onTextChange={handleTextChange}
          onDragStart={handleDragStart}
          onDragOver={() => {}}
          onDrop={handleDrop}
        />
        <ScopeList
          title="Out of Scope"
          items={outOfScope}
          listKey="outOfScope"
          color="var(--color-error)"
          onAdd={handleAdd}
          onRemove={handleRemove}
          onTextChange={handleTextChange}
          onDragStart={handleDragStart}
          onDragOver={() => {}}
          onDrop={handleDrop}
        />
      </TwoColumnGrid>
    </div>
  );
}
