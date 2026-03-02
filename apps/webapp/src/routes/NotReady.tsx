import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { signOut } from '../lib/firebase'
import { Button } from '@mycscompanion/ui/src/components/ui/button'
import { Card, CardContent, CardHeader } from '@mycscompanion/ui/src/components/ui/card'

interface Resource {
  readonly title: string
  readonly description: string
  readonly href: string
}

const RESOURCES: readonly Resource[] = [
  {
    title: 'A Tour of Go',
    description: 'The official interactive Go tutorial — covers all the fundamentals in your browser.',
    href: 'https://go.dev/tour/',
  },
  {
    title: 'Go by Example',
    description: 'Annotated code examples for every core concept, from hello-world to concurrency.',
    href: 'https://gobyexample.com/',
  },
  {
    title: 'The Go Programming Language (book)',
    description: 'Thorough reference by Donovan & Kernighan. Chapters 1-5 cover everything you need.',
    href: 'https://www.gopl.io/',
  },
  {
    title: 'Codecademy: Learn Go',
    description: 'Structured interactive course if you prefer step-by-step lessons.',
    href: 'https://www.codecademy.com/learn/learn-go',
  },
]

export function NotReady(): React.ReactElement {
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = useCallback(async () => {
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      // Sign-out failure is non-critical — navigate to sign-in regardless
    }
    navigate('/sign-in', { replace: true })
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <h1 className="text-2xl font-semibold leading-none">
            Go might be new territory — and that's totally fine
          </h1>
          <p className="text-muted-foreground">
            mycscompanion assumes you can already read basic code — loops,
            conditionals, and functions. A few focused weeks of study will get
            you there.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Resource list */}
          <section aria-labelledby="resources-heading">
            <h2 id="resources-heading" className="mb-3 text-lg font-medium">
              Recommended starting points
            </h2>
            <ul className="space-y-3">
              {RESOURCES.map((r) => (
                <li key={r.href}>
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-md bg-muted p-3 transition-colors hover:bg-muted/80"
                  >
                    <span className="font-medium text-foreground group-hover:underline">
                      {r.title}
                    </span>
                    <span className="sr-only"> (opens in new tab)</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {r.description}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* Return message */}
          <p className="text-sm text-muted-foreground">
            Bookmark this page and come back anytime — your account stays
            active and we'll be here when you're ready.
          </p>

          {/* Sign out */}
          <Button
            variant="outline"
            className="min-h-11 w-full"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out\u2026' : 'Sign out'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
