/**
 * SidebarConnector — draws SVG connector lines from the
 * focused subsection (in the content column) to the AI sidebar, spanning
 * the grid gap with smooth bezier curves.
 *
 * The connector is a filled, semi-transparent band with a visible stroke,
 * similar to the gutter blocks in IntelliJ diff viewers.
 */

import { useCallback, useEffect, useState } from 'react';

export default function SidebarConnector({ containerRef, sidebarRef, focusedSubSection, visible }) {
  const [geometry, setGeometry] = useState(null);

  const calculate = useCallback(() => {
    if (!visible || !focusedSubSection || !containerRef?.current || !sidebarRef?.current) {
      setGeometry(null);
      return;
    }

    const subEl = document.querySelector(`[data-subsection="${focusedSubSection}"]`);
    if (!subEl) {
      setGeometry(null);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const subRect = subEl.getBoundingClientRect();
    const sidebarRect = sidebarRef.current.getBoundingClientRect();

    // Positions relative to the grid container's top-left
    const subRight = subRect.right - containerRect.left;
    const subTop = subRect.top - containerRect.top;
    const subBottom = subRect.bottom - containerRect.top;
    const sideLeft = sidebarRect.left - containerRect.left;
    const sideTop = sidebarRect.top - containerRect.top;
    const sideBottom = sidebarRect.bottom - containerRect.top;

    setGeometry({
      subRight,
      subTop,
      subBottom,
      sideLeft,
      sideTop,
      sideBottom,
      containerWidth: containerRect.width,
      containerHeight: Math.max(containerRef.current.scrollHeight, containerRect.height),
    });
  }, [visible, focusedSubSection, containerRef, sidebarRef]);

  useEffect(() => {
    calculate();
    // Recalculate on scroll (any scrollable ancestor) and resize
    window.addEventListener('scroll', calculate, true);
    window.addEventListener('resize', calculate);
    return () => {
      window.removeEventListener('scroll', calculate, true);
      window.removeEventListener('resize', calculate);
    };
  }, [calculate]);

  if (!geometry) return null;

  const {
    subRight,
    subTop,
    subBottom,
    sideLeft,
    sideTop,
    sideBottom,
    containerWidth,
    containerHeight,
  } = geometry;

  // Control-point offset: 50 % of the horizontal gap for smooth S-curves
  const gap = sideLeft - subRight;
  const cp = gap * 0.5;

  // Main band path — smooth bezier from subsection right edge to sidebar left edge
  const bandPath = `
    M ${subRight} ${subTop}
    C ${subRight + cp} ${subTop}, ${sideLeft - cp} ${sideTop}, ${sideLeft} ${sideTop}
    L ${sideLeft} ${sideBottom}
    C ${sideLeft - cp} ${sideBottom}, ${subRight + cp} ${subBottom}, ${subRight} ${subBottom}
    Z
  `;

  // Thin accent lines along the top and bottom curves for extra definition
  const topLine = `
    M ${subRight} ${subTop}
    C ${subRight + cp} ${subTop}, ${sideLeft - cp} ${sideTop}, ${sideLeft} ${sideTop}
  `;
  const bottomLine = `
    M ${subRight} ${subBottom}
    C ${subRight + cp} ${subBottom}, ${sideLeft - cp} ${sideBottom}, ${sideLeft} ${sideBottom}
  `;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: containerWidth,
        height: containerHeight,
        pointerEvents: 'none',
        zIndex: 5,
        overflow: 'visible',
      }}
    >
      {/* Filled band */}
      <path d={bandPath} fill="rgba(59, 130, 246, 0.05)" stroke="none" />
      {/* Top curve stroke */}
      <path
        d={topLine}
        fill="none"
        stroke="rgba(59, 130, 246, 0.30)"
        strokeWidth="1.5"
        strokeDasharray="6 3"
      />
      {/* Bottom curve stroke */}
      <path
        d={bottomLine}
        fill="none"
        stroke="rgba(59, 130, 246, 0.30)"
        strokeWidth="1.5"
        strokeDasharray="6 3"
      />
      {/* Small circles at connection points */}
      <circle cx={subRight} cy={(subTop + subBottom) / 2} r="3" fill="rgba(59, 130, 246, 0.4)" />
      <circle cx={sideLeft} cy={(sideTop + sideBottom) / 2} r="3" fill="rgba(59, 130, 246, 0.4)" />
    </svg>
  );
}
