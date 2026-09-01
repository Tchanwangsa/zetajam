import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { pageView } from './lib/analytics'

pageView()

export default mount(App, { target: document.getElementById('app')! })
