import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    if (typeof window !== 'undefined') {
      (window as any).__LAST_ERROR__ = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      };
    }
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#08090C] text-white flex flex-col items-center justify-center p-6 select-none">
          <div className="w-full max-w-sm flex flex-col items-center text-center p-6 rounded-3xl bg-[#12151D] border border-red-500/30 shadow-2xl animate-fadeIn">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4 text-red-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h2 className="text-lg font-bold text-white mb-1">Что-то пошло не так</h2>
            <p className="text-xs text-white/60 mb-5 leading-relaxed">
              Интерфейс столкнулся с неожиданной ошибкой. Ваши карты и баланс в полной безопасности на сервере.
            </p>

            {this.state.error && (
              <div className="w-full mb-5 p-3 rounded-xl bg-black/50 border border-white/10 text-left overflow-auto max-h-32 text-[11px] font-mono text-red-300">
                <span className="font-bold text-red-400 block mb-1">Ошибка:</span>
                {this.state.error.message}
              </div>
            )}

            <div className="w-full flex flex-col gap-2.5">
              <button
                onClick={this.handleReload}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-bold text-xs tracking-wider uppercase transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
              >
                <RotateCw className="w-4 h-4" />
                <span>Перезагрузить приложение</span>
              </button>

              <button
                onClick={this.handleReset}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-semibold tracking-wide transition-all border border-white/5"
              >
                Попробовать снова
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
