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
      color: 'from-orange-500 to-yellow-500',
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
      description: 'Winner deposits in time-locked contract',
      icon: <Lock className="w-5 h-5" />,
      color: 'from-yellow-500 to-orange-600',
      duration: 4000,
      events: [
        'Winning resolver selected',
        'HTLC contract deployed',
        'Resolver deposits destination tokens',
        'Contract locked with secret hash',
        'Timelock parameters set',
        'User notified of deposit'
      ]
    },
    {
      phase: 'withdrawal' as const,
      title: 'Secret Reveal',
      description: 'User reveals secret to complete swap',
      icon: <Eye className="w-5 h-5" />,
      color: 'from-orange-600 to-yellow-400',
      duration: 2000,
      events: [
        'User verifies contract state',
        'Secret revealed on-chain',
        'User claims destination tokens',
        'Resolver observes secret',
        'Resolver claims source tokens',
        'Atomic swap completed'
      ]
    }
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (demoState.isPlaying && demoState.phase !== 'complete') {
      interval = setInterval(() => {
        setDemoState(prev => {
          const currentStep = demoSteps.find(step => step.phase === prev.phase);
          if (!currentStep) return prev;
          
          const newProgress = prev.progress + (100 / (currentStep.duration / 100));
          
          if (newProgress >= 100) {
            const currentStepIndex = demoSteps.findIndex(step => step.phase === prev.phase);
            const nextStep = demoSteps[currentStepIndex + 1];
            
            if (nextStep) {
              return {
                ...prev,
                phase: nextStep.phase,
                progress: 0,
                stepIndex: currentStepIndex + 1
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
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [demoState.isPlaying, demoState.phase]);

  const handlePlay = () => {
    if (demoState.phase === 'idle' || demoState.phase === 'complete') {
      setDemoState({
        phase: 'auction',
        progress: 0,
        isPlaying: true,
        stepIndex: 0
      });
    } else {
      setDemoState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    }
  };

  const handleReset = () => {
    setDemoState({
      phase: 'idle',
      progress: 0,
      isPlaying: false,
      stepIndex: 0
    });
  };

  const getCurrentStep = () => {
    return demoSteps.find(step => step.phase === demoState.phase) || demoSteps[0];
  };

  const getPhaseProgress = () => {
    if (demoState.phase === 'complete') return 100;
    const baseProgress = (demoState.stepIndex / demoSteps.length) * 100;
    const stepProgress = (demoState.progress / demoSteps.length);
    return baseProgress + stepProgress;
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-8 bg-black">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-4xl md:text-6xl font-black mb-6 bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-400 bg-clip-text text-transparent font-[family-name:var(--font-unbounded)]">
          Interactive Swap Demo
        </h2>
        <p className="text-xl text-neutral-300 max-w-4xl mx-auto font-[family-name:var(--font-spline-sans-mono)]">
          Watch a <span className="text-orange-400 font-semibold">live simulation</span> of how our cross-chain swap protocol works in real-time
        </p>
      </div>

      {/* Main Content - Left/Right Layout */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Side - Swap Configuration */}
        <Card className="bg-black/80 border-neutral-800/50">
          <CardHeader>
            <CardTitle className="flex items-center text-white font-[family-name:var(--font-unbounded)]">
              <Settings className="w-6 h-6 mr-3 text-orange-400" />
              Swap Configuration
            </CardTitle>
            <CardDescription className="text-neutral-300 font-[family-name:var(--font-spline-sans-mono)]">
              Simulated cross-chain transaction
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* From Token */}
            <div className="p-4 bg-black/40 rounded-xl border border-orange-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-neutral-400 text-sm font-[family-name:var(--font-spline-sans-mono)]">From</span>
                <span className="text-orange-400 font-medium text-sm font-[family-name:var(--font-spline-sans-mono)]">{swapDetails.fromChain}</span>
              </div>
              <div className="text-2xl font-bold text-white font-[family-name:var(--font-unbounded)]">
                {swapDetails.amount} {swapDetails.fromToken}
              </div>
            </div>
            
            {/* Arrow */}
            <div className="flex justify-center">
              <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full flex items-center justify-center text-black">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>

            {/* To Token */}
            <div className="p-4 bg-black/40 rounded-xl border border-orange-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-neutral-400 text-sm font-[family-name:var(--font-spline-sans-mono)]">To</span>
                <span className="text-yellow-400 font-medium text-sm font-[family-name:var(--font-spline-sans-mono)]">{swapDetails.toChain}</span>
              </div>
              <div className="text-2xl font-bold text-white font-[family-name:var(--font-unbounded)]">
                {swapDetails.estimatedOutput} {swapDetails.toToken}
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex space-x-3 pt-4">
              <Button
                onClick={handlePlay}
                variant="gradient"
                className="flex-1 bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700"
              >
                {demoState.isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {demoState.phase === 'idle' ? 'Start Demo' : demoState.isPlaying ? 'Pause' : 'Resume'}
              </Button>
              <Button onClick={handleReset} variant="outline" className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10">
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            
          </CardContent>
        </Card>

        {/* Right Side - Demo Interface */}
        <Card className="lg:col-span-2 bg-black/80 border-neutral-800/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center text-white font-[family-name:var(--font-unbounded)]">
                  <Zap className="w-6 h-6 mr-3 text-orange-400" />
                  Live Demo Execution
                </CardTitle>
                <CardDescription className="text-neutral-300 font-[family-name:var(--font-spline-sans-mono)]">
                  {demoState.phase === 'idle' ? 'Ready to start simulation' : 
                   demoState.phase === 'complete' ? 'Swap completed successfully' :
                   `Phase ${demoState.stepIndex + 1} of ${demoSteps.length} - ${getCurrentStep().title}`}
                </CardDescription>
              </div>
              {demoState.phase !== 'idle' && demoState.phase !== 'complete' && (
                <div className="text-sm text-orange-400 font-[family-name:var(--font-spline-sans-mono)]">
                  {Math.round(getPhaseProgress())}% Complete
                </div>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Overall Progress */}
            {demoState.phase !== 'idle' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-neutral-300 font-[family-name:var(--font-spline-sans-mono)]">Overall Progress</span>
                  <span className="text-sm font-medium text-orange-400 font-[family-name:var(--font-spline-sans-mono)]">
                    {Math.round(getPhaseProgress())}%
                  </span>
                </div>
                <Progress value={getPhaseProgress()} className="h-3" />
              </div>
            )}

            {/* Phase Steps */}
            <div className="grid md:grid-cols-3 gap-4">
              {demoSteps.map((step, index) => (
                <motion.div
                  key={step.phase}
                  className={`p-4 rounded-xl border transition-all duration-300 ${
                    demoState.phase === step.phase
                      ? 'bg-neutral-900/60 border-orange-500/50'
                      : demoState.stepIndex > index
                      ? 'bg-neutral-900/40 border-orange-500/30'
                      : 'bg-neutral-900/20 border-neutral-800/50'
                  }`}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-r ${step.color} text-black`}>
                      {step.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white text-sm font-[family-name:var(--font-unbounded)]">
                        {step.title}
                      </h3>
                      <p className="text-xs text-neutral-400 font-[family-name:var(--font-spline-sans-mono)]">
                        {step.description}
                      </p>
                    </div>
                    <div>
                      {demoState.stepIndex > index ? (
                        <CheckCircle className="w-5 h-5 text-orange-400" />
                      ) : demoState.phase === step.phase ? (
                        <div className="w-5 h-5 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-neutral-600" />
                      )}
                    </div>
                  </div>
                  
                  {demoState.phase === step.phase && (
                    <Progress value={demoState.progress} className="h-1 mt-2" />
                  )}
                </motion.div>
              ))}
            </div>

            {/* Current Phase Details */}
            <AnimatePresence mode="wait">
              {demoState.phase === 'idle' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12"
                >
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 flex items-center justify-center text-black">
                    <Play className="w-10 h-10 ml-1" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2 font-[family-name:var(--font-unbounded)]">
                    Ready to Demonstrate
                  </h3>
                  <p className="text-neutral-400 mb-6 font-[family-name:var(--font-spline-sans-mono)]">
                    Click &quot;Start Demo&quot; to watch how a cross-chain swap works
                  </p>
                </motion.div>
              )}

              {demoState.phase !== 'idle' && demoState.phase !== 'complete' && (
                <motion.div
                  key={demoState.phase}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-neutral-900/50 rounded-2xl p-6 border border-neutral-800/50"
                >
                  <div className="flex items-center space-x-3 mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-r ${getCurrentStep().color} text-black`}>
                      {getCurrentStep().icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white font-[family-name:var(--font-unbounded)]">
                        {getCurrentStep().title}
                      </h3>
                      <p className="text-orange-400 text-sm font-[family-name:var(--font-spline-sans-mono)]">
                        {getCurrentStep().description}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-white mb-3 font-[family-name:var(--font-unbounded)]">
                      Current Events:
                    </h4>
                    {getCurrentStep().events.map((event, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ 
                          opacity: (demoState.progress / 100) > (index / getCurrentStep().events.length) ? 1 : 0.3,
                          x: 0 
                        }}
                        className="flex items-center space-x-3"
                      >
                        {(demoState.progress / 100) > (index / getCurrentStep().events.length) ? (
                          <CheckCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-neutral-600 flex-shrink-0" />
                        )}
                        <span className="text-sm text-neutral-300 font-[family-name:var(--font-spline-sans-mono)]">
                          {event}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {demoState.phase === 'complete' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-neutral-900/60 rounded-2xl p-8 border border-orange-500/40 text-center"
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 flex items-center justify-center text-black">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2 font-[family-name:var(--font-unbounded)]">
                    Swap Complete!
                  </h3>
                  <p className="text-neutral-300 mb-4 font-[family-name:var(--font-spline-sans-mono)]">
                    Cross-chain atomic swap executed successfully
                  </p>
                  <div className="flex items-center justify-center space-x-4 text-sm">
                    <div className="bg-black/40 rounded-lg px-4 py-2 border border-orange-500/20">
                      <span className="text-neutral-400 font-[family-name:var(--font-spline-sans-mono)]">Sent:</span>
                      <span className="text-white font-semibold ml-2 font-[family-name:var(--font-spline-sans-mono)]">
                        {swapDetails.amount} {swapDetails.fromToken}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-orange-400" />
                    <div className="bg-black/40 rounded-lg px-4 py-2 border border-orange-500/20">
                      <span className="text-neutral-400 font-[family-name:var(--font-spline-sans-mono)]">Received:</span>
                      <span className="text-white font-semibold ml-2 font-[family-name:var(--font-spline-sans-mono)]">
                        {swapDetails.estimatedOutput} {swapDetails.toToken}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InteractiveDemo; 