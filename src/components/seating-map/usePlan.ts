import { useEffect, useState } from 'react';
import planOriginal from '../../assets/planta.png';
import { PLAN_HEIGHT, PLAN_WIDTH } from '../../data/floorplan';
import { useApp } from '../../state/store';

/** Imagem da planta em uso e o sistema de coordenadas do mapa (largura fixa 1013 u). */
export function usePlan() {
  const custom = useApp((s) => s.layout.customPlan);
  const src = custom || planOriginal;
  const [height, setHeight] = useState(custom ? PLAN_HEIGHT : PLAN_HEIGHT);
  useEffect(() => {
    if (!custom) { setHeight(PLAN_HEIGHT); return; }
    const img = new Image();
    img.onload = () => setHeight(Math.round((PLAN_WIDTH * img.naturalHeight) / img.naturalWidth));
    img.src = custom;
  }, [custom]);
  return { src, width: PLAN_WIDTH, height, isCustom: !!custom };
}
