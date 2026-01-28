import Header from '../components/Header'

function Admin({ user, logout }) {
  return (
    <div>
      <Header user={user} logout={logout} />
      <div className="container">
        <h2>Admin Panel</h2>
      </div>
    </div>
  )
}

export default Admin
