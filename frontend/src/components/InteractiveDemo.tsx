'use client'
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Progress } from './ui/progress';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ArrowRight, 
  Gavel,
  Lock,
  Eye,
  Clock,
  CheckCircle,
  User,
  Settings,
  Zap,
  Shield
} from 'lucide-react';

interface DemoState {
  phase: 'idle' | 'auction' | 'deposit' | 'withdrawal' | 'complete';
  progress: number;
  isPlaying: boolean;
  stepIndex: number;
}

interface SwapDetails {
  fromToken: string;
  toToken: string;
  fromChain: string;
  toChain: string;
  amount: string;
  estimatedOutput: string;
}

const InteractiveDemo: React.FC = () => {
  const [demoState, setDemoState] = useState<DemoState>({
    phase: 'idle',
    progress: 0,
    isPlaying: false,
    stepIndex: 0
  });

  const [swapDetails] = useState<SwapDetails>({
    fromToken: 'ETH',
    toToken: 'USDC',
    fromChain: 'Ethereum',
    toChain: 'Polygon',
    amount: '1.5',
    estimatedOutput: '4,800'
  });

  const demoSteps = [
    {
      phase: 'auction' as const,
      title: 'Order Announcement',
      description: 'User signs swap order, auction begins',
      icon: <Gavel className="w-5 h-5" />,
      color: 'from-purple-500 to-pink-500',
      duration: 3000,
      events: [
        'User signs Fusion+ order',
        'Secret hash generated',
        'Order sent to 1inch backend',
        'Broadcasted to all resolvers',
        'Dutch auction started',
        'Resolvers submit competitive bids'
      ]
    },
    {
      phase: 'deposit' as const,
      title: 'Escrow Setup',
      description: 'Winner deploys escrow contracts',
      icon: <Lock className="w-5 h-5" />,
      color: 'from-blue-500 to-cyan-500',
      duration: 4000,
      events: [
        'Resolver wins auction',
        'EscrowSrc deployed on Ethereum',
        'User tokens locked with hashlock',
        'Safety deposit added',
        'EscrowDst deployed on Polygon',
        'Resolver deposits USDC'
      ]
    },
    {
      phase: 'withdrawal' as const,
      title: 'Secret Reveal',
      description: 'Atomic swap execution',
      icon: <Eye className="w-5 h-5" />,
      color: 'from-green-500 to-emerald-500',
      duration: 2000,
      events: [
        'Both escrows confirmed',
        'User reveals secret',
        'Resolver unlocks USDC for user',
        'User receives USDC on Polygon',
        'Resolver claims ETH from Ethereum',
        'Safety deposits refunded'
      ]
    }
  ];

  const currentStep = demoSteps.find(step => step.phase === demoState.phase);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (demoState.isPlaying && demoState.phase !== 'idle' && demoState.phase !== 'complete') {
      const step = demoSteps.find(s => s.phase === demoState.phase);
      if (step) {
        interval = setInterval(() => {
          setDemoState(prev => {
            const newProgress = prev.progress + (100 / (step.duration / 100));
            
            if (newProgress >= 100) {
              const currentStepIndex = demoSteps.findIndex(s => s.phase === prev.phase);
              const nextStep = demoSteps[currentStepIndex + 1];
              
              if (nextStep) {
                return {
                  ...prev,
                  phase: nextStep.phase,
                  progress: 0,
                  stepIndex: prev.stepIndex + 1
                };
              } else {
                return {
                  ...prev,
                  phase: 'complete',
                  progress: 100,
                  isPlaying: false
                };
              }
            }
            
            return { ...prev, progress: newProgress };
          });
        }, 100);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [demoState.isPlaying, demoState.phase]);

  const startDemo = () => {
    setDemoState({
      phase: 'auction',
      progress: 0,
      isPlaying: true,
      stepIndex: 0
    });
  };

  const pauseDemo = () => {
    setDemoState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const resetDemo = () => {
    setDemoState({
      phase: 'idle',
      progress: 0,
      isPlaying: false,
      stepIndex: 0
    });
  };

  const getEventProgress = (eventIndex: number): number => {
    if (!currentStep) return 0;
    const eventsPerProgress = 100 / currentStep.events.length;
    return Math.min(100, Math.max(0, (demoState.progress - (eventIndex * eventsPerProgress)) / eventsPerProgress * 100));
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-4">
          Interactive Swap Demo
        </h2>
        <p className="text-lg text-slate-400">
          Watch a live simulation of a Fusion+ cross-chain swap
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Swap Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="w-5 h-5 mr-2 text-cyan-400" />
              Swap Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400">From</span>
                  <span className="text-cyan-400 font-medium">{swapDetails.fromChain}</span>
                </div>
                <div className="text-2xl font-bold text-white">
                  {swapDetails.amount} {swapDetails.fromToken}
                </div>
              </div>
              
              <div className="flex justify-center">
                <ArrowRight className="w-6 h-6 text-slate-400" />
              </div>
              
              <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400">To</span>
                  <span className="text-emerald-400 font-medium">{swapDetails.toChain}</span>
                </div>
                <div className="text-2xl font-bold text-white">
                  {swapDetails.estimatedOutput} {swapDetails.toToken}
                </div>
              </div>

              <div className="flex space-x-2 mt-6">
                {demoState.phase === 'idle' && (
                  <Button onClick={startDemo} variant="gradient" className="flex-1">
                    <Play className="w-4 h-4 mr-2" />
                    Start Demo
                  </Button>
                )}
                {demoState.phase !== 'idle' && demoState.phase !== 'complete' && (
                  <Button onClick={pauseDemo} variant="outline" className="flex-1">
                    {demoState.isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                    {demoState.isPlaying ? 'Pause' : 'Resume'}
                  </Button>
                )}
                <Button onClick={resetDemo} variant="outline">
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Phase */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                {currentStep ? (
                  <>
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-r ${currentStep.color} flex items-center justify-center mr-3`}>
                      {currentStep.icon}
                    </div>
                    {currentStep.title}
                  </>
                ) : (
                  <>
                    <User className="w-6 h-6 mr-2 text-slate-400" />
                    Ready to Start
                  </>
                )}
              </CardTitle>
              {demoState.phase !== 'idle' && (
                <div className="text-sm text-slate-400">
                  Step {demoState.stepIndex + 1} of {demoSteps.length}
                </div>
              )}
            </div>
            {currentStep && (
              <CardDescription>{currentStep.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {demoState.phase === 'idle' ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Play className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-400">Click "Start Demo" to begin the simulation</p>
              </div>
            ) : demoState.phase === 'complete' ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Swap Complete!</h3>
                <p className="text-slate-400">Your tokens have been successfully swapped across chains</p>
                <div className="mt-4 p-4 bg-green-900/20 rounded-xl border border-green-500/30">
                  <div className="flex items-center justify-center space-x-2">
                    <Shield className="w-5 h-5 text-green-400" />
                    <span className="text-green-300">Atomic swap completed successfully</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-4">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-400">Overall Progress</span>
                    <span className="text-sm text-white">{Math.round(demoState.progress)}%</span>
                  </div>
                  <Progress value={demoState.progress} className="h-2" />
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-white">Current Events:</h4>
                  {currentStep?.events.map((event, index) => {
                    const eventProgress = getEventProgress(index);
                    const isActive = eventProgress > 0 && eventProgress < 100;
                    const isComplete = eventProgress >= 100;
                    
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 ${
                          isComplete ? 'bg-green-900/20 border border-green-500/30' :
                          isActive ? 'bg-cyan-900/20 border border-cyan-500/30' :
                          'bg-slate-800/30 border border-slate-700/30'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          isComplete ? 'bg-green-500' :
                          isActive ? 'bg-cyan-500 animate-pulse' :
                          'bg-slate-600'
                        }`}>
                          {isComplete ? (
                            <CheckCircle className="w-4 h-4 text-white" />
                          ) : isActive ? (
                            <Zap className="w-4 h-4 text-white" />
                          ) : (
                            <div className="w-2 h-2 bg-slate-400 rounded-full" />
                          )}
                        </div>
                        <span className={`text-sm ${
                          isComplete ? 'text-green-300' :
                          isActive ? 'text-cyan-300' :
                          'text-slate-400'
                        }`}>
                          {event}
                        </span>
                        {isActive && (
                          <div className="flex-1 ml-4">
                            <Progress value={eventProgress} className="h-1" />
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InteractiveDemo; 