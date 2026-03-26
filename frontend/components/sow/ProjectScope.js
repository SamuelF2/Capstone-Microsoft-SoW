import { useRef, useState } from 'react';

function genId() {
  return `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

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
        <h3
          className="font-semibold"
          style={{ color: listKey === 'inScope' ? 'var(--color-success)' : 'var(--color-error)' }}
        >
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
          + Add Item
        </button>
      </div>

      <div
        style={{
          minHeight: '200px',
          border: '2px dashed var(--color-border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-sm)',
          backgroundColor: 'var(--color-bg-secondary)',
          transition: 'border-color var(--transition-base)',
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
            Drag items here or click "+ Add Item"
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
                lineHeight: '1.5',
                cursor: 'grab',
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
                lineHeight: 1,
                padding: '2px 4px',
                flexShrink: 0,
              }}
              title="Remove item"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectScope({ data, onChange }) {
  const dragItem = useRef(null);
  const dragSource = useRef(null);

  const inScope = data?.inScope ?? [];
  const outOfScope = data?.outOfScope ?? [];

  const update = (newInScope, newOutOfScope) => {
    onChange({ ...data, inScope: newInScope, outOfScope: newOutOfScope });
  };

  const handleAdd = (listKey) => {
    const newItem = { id: genId(), text: '' };
    if (listKey === 'inScope') {
      update([...inScope, newItem], outOfScope);
    } else {
      update(inScope, [...outOfScope, newItem]);
    }
  };

  const handleRemove = (listKey, id) => {
    if (listKey === 'inScope') {
      update(
        inScope.filter((i) => i.id !== id),
        outOfScope
      );
    } else {
      update(
        inScope,
        outOfScope.filter((i) => i.id !== id)
      );
    }
  };

  const handleTextChange = (listKey, id, text) => {
    if (listKey === 'inScope') {
      update(
        inScope.map((i) => (i.id === id ? { ...i, text } : i)),
        outOfScope
      );
    } else {
      update(
        inScope,
        outOfScope.map((i) => (i.id === id ? { ...i, text } : i))
      );
    }
  };

  const handleDragStart = (id, sourceList) => {
    dragItem.current = id;
    dragSource.current = sourceList;
  };

  const handleDragOver = () => {};

  const handleDrop = (targetList) => {
    const id = dragItem.current;
    const source = dragSource.current;
    if (!id || source === targetList) {
      dragItem.current = null;
      dragSource.current = null;
      return;
    }

    let sourceList = source === 'inScope' ? [...inScope] : [...outOfScope];
    let targetListArr = targetList === 'inScope' ? [...inScope] : [...outOfScope];

    const itemIndex = sourceList.findIndex((i) => i.id === id);
    if (itemIndex === -1) {
      dragItem.current = null;
      dragSource.current = null;
      return;
    }

    const [movedItem] = sourceList.splice(itemIndex, 1);
    targetListArr.push(movedItem);

    const newInScope = source === 'inScope' ? sourceList : targetListArr;
    const newOutOfScope = source === 'outOfScope' ? sourceList : targetListArr;
    update(newInScope, newOutOfScope);

    dragItem.current = null;
    dragSource.current = null;
  };

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Project Scope</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Define what is included and excluded from this engagement. Drag items between lists to
          reclassify them.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-xl)',
        }}
      >
        <ScopeList
          title="In Scope"
          items={inScope}
          listKey="inScope"
          onAdd={handleAdd}
          onRemove={handleRemove}
          onTextChange={handleTextChange}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
        <ScopeList
          title="Out of Scope"
          items={outOfScope}
          listKey="outOfScope"
          onAdd={handleAdd}
          onRemove={handleRemove}
          onTextChange={handleTextChange}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
      </div>
    </div>
  );
}
