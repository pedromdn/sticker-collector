import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

function parseCredentials(formData: FormData) {
	const email = formData.get('email');
	const password = formData.get('password');

	if (typeof email !== 'string' || !email.includes('@')) {
		return { error: 'Ingresa un correo válido.' } as const;
	}
	if (typeof password !== 'string' || password.length < 6) {
		return { error: 'La contraseña debe tener al menos 6 caracteres.' } as const;
	}

	return { email, password } as const;
}

export const actions: Actions = {
	login: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const parsed = parseCredentials(formData);
		if ('error' in parsed) {
			return fail(400, { error: parsed.error, email: String(formData.get('email') ?? '') });
		}

		const { error } = await supabase.auth.signInWithPassword({
			email: parsed.email,
			password: parsed.password
		});

		if (error) {
			return fail(400, { error: 'Correo o contraseña incorrectos.', email: parsed.email });
		}

		redirect(303, '/');
	},

	signup: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const parsed = parseCredentials(formData);
		if ('error' in parsed) {
			return fail(400, { error: parsed.error, email: String(formData.get('email') ?? ''), mode: 'signup' });
		}

		const { data, error } = await supabase.auth.signUp({
			email: parsed.email,
			password: parsed.password
		});

		if (error) {
			return fail(400, { error: error.message, email: parsed.email, mode: 'signup' });
		}

		// If email confirmations are disabled in Supabase, signUp returns an
		// active session right away and we can log the user straight in.
		if (data.session) {
			redirect(303, '/');
		}

		return {
			signedUp: true,
			email: parsed.email,
			mode: 'signup' as const
		};
	}
};
