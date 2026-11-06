import { SCREENS, type ScreenId } from '../screens';

export type TourKey = `tour.${ScreenId}.note`;

export type TourStep = { screen: ScreenId; route: string; /** The title is the Screen name, so it is translated once, in the dictionary. */
  titleKey: `screen.${ScreenId}`; noteKey: TourKey };

/** The neutral Tour: linear, one step per Screen, in the order of SCREENS. */
export const TOUR_STEPS: readonly TourStep[] = SCREENS.map((s) => ({
  screen: s.id,
  route: s.route,
  titleKey: `screen.${s.id}` as const,
  noteKey: `tour.${s.id}.note` as const,
}));

export const TOUR_MESSAGES: Record<'en' | 'pt-BR', Record<TourKey, string>> = {
  en: {
    'tour.deck.note': 'Look at how the Line status, the Critical Alarm banner and the live KPIs are shown. Then trigger Emergency stop and see how it asks for confirmation.',
    'tour.recipes.note': 'Look at how a Draft that fails a Dependency Rule is shown. Check how Save is blocked until it passes.',
    'tour.ledger.note': 'Look at the dense grid: sorting, column filters and selecting up to 4 rows. Then open the side drawer.',
    'tour.performance.note': 'Look at OEE and its parts, the downtime Pareto and output against target.',
    'tour.parameters.note': 'Look at the Tag grid, the trend of several Tags together and the Setpoint Override form.',
    'tour.control.note': 'Look at the Alarm list with acknowledge, the Event Log and the communication diagnostics.',
  },
  'pt-BR': {
    'tour.deck.note': 'Veja como aparecem o status da Linha, o banner de Alarme crítico e os KPIs ao vivo. Depois acione a Parada de emergência e observe como ela pede confirmação.',
    'tour.recipes.note': 'Veja como um Rascunho que viola uma Regra de dependência é mostrado. Confira como o Salvar fica bloqueado até a correção.',
    'tour.ledger.note': 'Veja a grade densa: ordenação, filtros por coluna e seleção de até 4 itens. Depois abra a gaveta lateral.',
    'tour.performance.note': 'Veja o OEE e suas partes, o Pareto de paradas e a produção em relação à meta.',
    'tour.parameters.note': 'Veja a grade de Tags, a tendência de várias Tags juntas e o formulário de alteração manual de setpoint.',
    'tour.control.note': 'Veja a lista de Alarmes com Reconhecer, o Registro de eventos e o diagnóstico de comunicação.',
  },
};

export function tourStepAt(index: number): TourStep | undefined {
  return TOUR_STEPS[index];
}

const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < TOUR_STEPS.length;

export function nextStep(index: number): number | null {
  return inRange(index) && index + 1 < TOUR_STEPS.length ? index + 1 : null;
}

export function previousStep(index: number): number | null {
  return inRange(index) && index > 0 ? index - 1 : null;
}

export function isLastStep(index: number): boolean {
  return index === TOUR_STEPS.length - 1;
}

export function stepForRoute(route: string): number | null {
  const i = TOUR_STEPS.findIndex((s) => s.route === route);
  return i === -1 ? null : i;
}
