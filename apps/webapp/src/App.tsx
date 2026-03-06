import { Suspense } from 'react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import { SignIn } from './routes/SignIn'
import { SignUp } from './routes/SignUp'
import { Onboarding } from './routes/Onboarding'
import { NotReady } from './routes/NotReady'
import { WorkspaceSkeleton } from './components/workspace/WorkspaceSkeleton'
import { CompletionSkeleton } from './components/completion/CompletionSkeleton'
import { OverviewSkeleton } from './components/overview/OverviewSkeleton'

const Workspace = React.lazy(() => import('./routes/Workspace'))
const Completion = React.lazy(() => import('./routes/Completion'))
const Overview = React.lazy(() => import('./routes/Overview'))

const queryClient = new QueryClient()

function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route
            path="/overview"
            element={
              <Suspense fallback={<OverviewSkeleton />}>
                <Overview />
              </Suspense>
            }
          />
          <Route
            path="/workspace/:milestoneId"
            element={
              <Suspense fallback={<WorkspaceSkeleton />}>
                <Workspace />
              </Suspense>
            }
          />
          <Route
            path="/completion/:milestoneId"
            element={
              <Suspense fallback={<CompletionSkeleton />}>
                <Completion />
              </Suspense>
            }
          />
          <Route path="/not-ready" element={<NotReady />} />
          <Route path="/" element={<Navigate to="/overview" replace />} />
        </Route>

        {/* Catch-all — redirect unknown paths through auth check */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </QueryClientProvider>
  )
}

export { App }
