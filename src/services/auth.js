import { supabase } from '../supabaseClient'

export async function obtenerRolUsuario() {

  const {
    data: {
      user
    },
    error: userError
  } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }

  if (!user) {
    return null
  }

  const {
    data,
    error
  } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (error) {
    throw error
  }

  return data.role
}