import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Экран вместо упавшего поддерева; `reset` снова показывает детей. */
  fallback: (reset: () => void) => ReactNode;
  /** Смена ключа (например, маршрута) сбрасывает ошибку. */
  resetKey: string;
};

type State = { error: unknown; key: string };

/** Ловит ошибку рендера поддерева и показывает `fallback` вместо белого экрана. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error ?? new Error('unknown') };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[ui] ошибка экрана', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    return this.state.error !== null ? this.props.fallback(this.reset) : this.props.children;
  }
}
