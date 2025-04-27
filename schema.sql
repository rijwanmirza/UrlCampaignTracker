--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8
-- Dumped by pg_dump version 16.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: url_status; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public.url_status AS ENUM (
    'active',
    'paused',
    'completed',
    'deleted',
    'rejected'
);


ALTER TYPE public.url_status OWNER TO neondb_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_error_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.api_error_logs (
    id integer NOT NULL,
    endpoint text NOT NULL,
    method text NOT NULL,
    request_body json,
    error_message text NOT NULL,
    error_details json,
    status_code integer,
    campaign_id text,
    action_type text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.api_error_logs OWNER TO neondb_owner;

--
-- Name: api_error_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.api_error_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.api_error_logs_id_seq OWNER TO neondb_owner;

--
-- Name: api_error_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.api_error_logs_id_seq OWNED BY public.api_error_logs.id;


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.campaigns (
    id integer NOT NULL,
    name text NOT NULL,
    redirect_method text DEFAULT 'direct'::text NOT NULL,
    custom_path text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    multiplier numeric(10,2) DEFAULT 1 NOT NULL,
    price_per_thousand numeric(10,4) DEFAULT '0'::numeric NOT NULL,
    trafficstar_campaign_id text,
    auto_manage_trafficstar boolean DEFAULT false,
    last_trafficstar_sync timestamp without time zone,
    budget_update_time text DEFAULT '00:00:00'::text,
    daily_spent numeric(10,4) DEFAULT 0,
    daily_spent_date date DEFAULT CURRENT_DATE,
    last_spent_check timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.campaigns OWNER TO neondb_owner;

--
-- Name: campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.campaigns_id_seq OWNER TO neondb_owner;

--
-- Name: campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.campaigns_id_seq OWNED BY public.campaigns.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.sessions OWNER TO neondb_owner;

--
-- Name: trafficstar_campaigns; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.trafficstar_campaigns (
    id integer NOT NULL,
    trafficstar_id text NOT NULL,
    name text NOT NULL,
    status text NOT NULL,
    active boolean DEFAULT true,
    is_archived boolean DEFAULT false,
    max_daily numeric(10,2),
    pricing_model text,
    schedule_end_time text,
    campaign_data json,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    last_requested_action text,
    last_requested_action_at timestamp without time zone,
    last_requested_action_success boolean,
    last_verified_status text,
    sync_status text DEFAULT 'synced'::text,
    last_budget_update timestamp without time zone,
    last_budget_update_value numeric(10,2),
    last_end_time_update timestamp without time zone,
    last_end_time_update_value text,
    daily_spent numeric(10,2) DEFAULT 0,
    daily_spent_updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.trafficstar_campaigns OWNER TO neondb_owner;

--
-- Name: trafficstar_campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.trafficstar_campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.trafficstar_campaigns_id_seq OWNER TO neondb_owner;

--
-- Name: trafficstar_campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.trafficstar_campaigns_id_seq OWNED BY public.trafficstar_campaigns.id;


--
-- Name: trafficstar_credentials; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.trafficstar_credentials (
    id integer NOT NULL,
    api_key text NOT NULL,
    access_token text,
    token_expiry timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.trafficstar_credentials OWNER TO neondb_owner;

--
-- Name: trafficstar_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.trafficstar_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.trafficstar_credentials_id_seq OWNER TO neondb_owner;

--
-- Name: trafficstar_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.trafficstar_credentials_id_seq OWNED BY public.trafficstar_credentials.id;


--
-- Name: urls; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.urls (
    id integer NOT NULL,
    campaign_id integer,
    name text NOT NULL,
    target_url text NOT NULL,
    click_limit integer NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    original_click_limit integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.urls OWNER TO neondb_owner;

--
-- Name: urls_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.urls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.urls_id_seq OWNER TO neondb_owner;

--
-- Name: urls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.urls_id_seq OWNED BY public.urls.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    last_login timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    password_hash text,
    password_salt text
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO neondb_owner;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: api_error_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.api_error_logs ALTER COLUMN id SET DEFAULT nextval('public.api_error_logs_id_seq'::regclass);


--
-- Name: campaigns id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaigns ALTER COLUMN id SET DEFAULT nextval('public.campaigns_id_seq'::regclass);


--
-- Name: trafficstar_campaigns id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.trafficstar_campaigns ALTER COLUMN id SET DEFAULT nextval('public.trafficstar_campaigns_id_seq'::regclass);


--
-- Name: trafficstar_credentials id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.trafficstar_credentials ALTER COLUMN id SET DEFAULT nextval('public.trafficstar_credentials_id_seq'::regclass);


--
-- Name: urls id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.urls ALTER COLUMN id SET DEFAULT nextval('public.urls_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: api_error_logs api_error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.api_error_logs
    ADD CONSTRAINT api_error_logs_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_custom_path_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_custom_path_unique UNIQUE (custom_path);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: sessions session_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: trafficstar_campaigns trafficstar_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.trafficstar_campaigns
    ADD CONSTRAINT trafficstar_campaigns_pkey PRIMARY KEY (id);


--
-- Name: trafficstar_campaigns trafficstar_campaigns_trafficstar_id_unique; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.trafficstar_campaigns
    ADD CONSTRAINT trafficstar_campaigns_trafficstar_id_unique UNIQUE (trafficstar_id);


--
-- Name: trafficstar_credentials trafficstar_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.trafficstar_credentials
    ADD CONSTRAINT trafficstar_credentials_pkey PRIMARY KEY (id);


--
-- Name: urls urls_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.urls
    ADD CONSTRAINT urls_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

