import { createBrowserRouter } from 'react-router-dom'
import { Album } from '../pages/Album'
import { Artist } from '../pages/Artist'
import { AuthCallback } from '../pages/AuthCallback'
import { Home } from '../pages/Home'
import { Library } from '../pages/Library'
import { NotFound } from '../pages/NotFound'
import { Playlist } from '../pages/Playlist'
import { Search } from '../pages/Search'
import { Root } from './Root'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      { index: true, element: <Home /> },
      { path: 'search', element: <Search /> },
      { path: 'library', element: <Library /> },
      { path: 'album/:id', element: <Album /> },
      { path: 'artist/:id', element: <Artist /> },
      { path: 'playlist/:id', element: <Playlist /> },
      { path: 'callback', element: <AuthCallback /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
