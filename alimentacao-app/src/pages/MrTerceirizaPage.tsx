import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import { writeSite } from '../lib/sites'
import { Button } from '../components/ui/Button'

export function MrTerceirizaPage() {
  const { profile, signOut } = useAuth()
  const admin = hasRole(profile, 'admin')

  return (
    <div className="site-home">
      <header className="site-home-bar">
        <strong>MR TERCERRIZA</strong>
        <div className="site-home-actions">
          {admin ? (
            <Link to="/" className="site-switch" onClick={() => writeSite('nerites')}>
              Ir para Sistema Nerites
            </Link>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </header>
      <main className="site-home-body">
        <p className="site-kicker">Sistema</p>
        <h1>MR TERCERRIZA</h1>
        <p>
          Você entrou com o mesmo login. Este sistema está separado do Sistema Nerites.
          {admin ? ' Como administrador, você também acessa o Sistema Nerites.' : ''}
        </p>
      </main>
    </div>
  )
}
