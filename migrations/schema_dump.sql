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

ALTER TABLE ONLY public.url_click_records DROP CONSTRAINT url_click_records_url_id_fkey;
ALTER TABLE ONLY public.url_click_logs DROP CONSTRAINT url_click_logs_url_id_fkey;
ALTER TABLE ONLY public.click_analytics DROP CONSTRAINT "click_analytics_urlId_fkey";
ALTER TABLE ONLY public.click_analytics DROP CONSTRAINT "click_analytics_campaignId_fkey";
DROP TRIGGER update_original_url_records_trigger ON public.original_url_records;
DROP TRIGGER protect_original_click_values_trigger ON public.urls;
DROP TRIGGER prevent_test_auto_click_update_trigger ON public.click_protection_test;
DROP TRIGGER prevent_campaign_auto_click_update_trigger ON public.campaigns;
DROP TRIGGER prevent_auto_click_update_trigger ON public.urls;
DROP INDEX public.url_click_records_url_id_idx;
DROP INDEX public.url_click_logs_url_id_idx;
DROP INDEX public.original_url_records_name_idx;
DROP INDEX public.idx_campaigns_traffic_sender_enabled;
DROP INDEX public.idx_campaign_click_records_url_id;
DROP INDEX public.idx_campaign_click_records_timestamp;
DROP INDEX public.idx_campaign_click_records_campaign_id;
DROP INDEX public."IDX_session_expire";
ALTER TABLE ONLY public.users DROP CONSTRAINT users_username_key;
ALTER TABLE ONLY public.users DROP CONSTRAINT users_pkey;
ALTER TABLE ONLY public.urls DROP CONSTRAINT urls_pkey;
ALTER TABLE ONLY public.url_click_records DROP CONSTRAINT url_click_records_pkey;
ALTER TABLE ONLY public.url_click_logs DROP CONSTRAINT url_click_logs_pkey;
ALTER TABLE ONLY public.trafficstar_credentials DROP CONSTRAINT trafficstar_credentials_pkey;
ALTER TABLE ONLY public.trafficstar_campaigns DROP CONSTRAINT trafficstar_campaigns_trafficstar_id_unique;
ALTER TABLE ONLY public.trafficstar_campaigns DROP CONSTRAINT trafficstar_campaigns_pkey;
ALTER TABLE ONLY public.sync_operations DROP CONSTRAINT sync_operations_pkey;
ALTER TABLE ONLY public.sessions DROP CONSTRAINT session_pkey;
ALTER TABLE ONLY public.protection_settings DROP CONSTRAINT protection_settings_pkey;
ALTER TABLE ONLY public.original_url_records DROP CONSTRAINT original_url_records_pkey;
ALTER TABLE ONLY public.original_url_records DROP CONSTRAINT original_url_records_name_key;
ALTER TABLE ONLY public.click_protection_test DROP CONSTRAINT click_protection_test_pkey;
ALTER TABLE ONLY public.click_analytics DROP CONSTRAINT click_analytics_pkey;
ALTER TABLE ONLY public.campaigns DROP CONSTRAINT campaigns_pkey;
ALTER TABLE ONLY public.campaigns DROP CONSTRAINT campaigns_custom_path_unique;
ALTER TABLE ONLY public.campaign_redirect_logs DROP CONSTRAINT campaign_redirect_logs_pkey;
ALTER TABLE ONLY public.campaign_click_records DROP CONSTRAINT campaign_click_records_pkey;
ALTER TABLE ONLY public.api_error_logs DROP CONSTRAINT api_error_logs_pkey;
ALTER TABLE public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.urls ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.url_click_records ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.url_click_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.trafficstar_credentials ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.trafficstar_campaigns ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.sync_operations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.original_url_records ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.click_protection_test ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.click_analytics ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.campaigns ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.campaign_redirect_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.campaign_click_records ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.api_error_logs ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE public.users_id_seq;
DROP TABLE public.users;
DROP SEQUENCE public.urls_id_seq;
DROP TABLE public.urls;
DROP SEQUENCE public.url_click_records_id_seq;
DROP TABLE public.url_click_records;
DROP SEQUENCE public.url_click_logs_id_seq;
DROP TABLE public.url_click_logs;
DROP SEQUENCE public.trafficstar_credentials_id_seq;
DROP TABLE public.trafficstar_credentials;
DROP SEQUENCE public.trafficstar_campaigns_id_seq;
DROP TABLE public.trafficstar_campaigns;
DROP SEQUENCE public.sync_operations_id_seq;
DROP TABLE public.sync_operations;
DROP TABLE public.sessions;
DROP TABLE public.protection_settings;
DROP SEQUENCE public.original_url_records_id_seq;
DROP TABLE public.original_url_records;
DROP SEQUENCE public.click_protection_test_id_seq;
DROP TABLE public.click_protection_test;
DROP SEQUENCE public.click_analytics_id_seq;
DROP TABLE public.click_analytics;
DROP SEQUENCE public.campaigns_id_seq;
DROP TABLE public.campaigns;
DROP SEQUENCE public.campaign_redirect_logs_id_seq;
DROP TABLE public.campaign_redirect_logs;
DROP SEQUENCE public.campaign_click_records_id_seq;
DROP TABLE public.campaign_click_records;
DROP SEQUENCE public.api_error_logs_id_seq;
DROP TABLE public.api_error_logs;
DROP FUNCTION public.update_original_url_records_updated_at();
DROP FUNCTION public.update_original_click_value(url_id integer, new_original_click_limit integer);
DROP FUNCTION public.start_auto_sync();
DROP FUNCTION public.protect_original_click_values();
DROP FUNCTION public.prevent_unauthorized_click_updates();
DROP FUNCTION public.prevent_test_auto_clicks_updates();
DROP FUNCTION public.prevent_campaign_auto_click_updates();
DROP FUNCTION public.prevent_auto_click_updates();
DROP FUNCTION public.is_auto_sync();
DROP FUNCTION public.end_auto_sync(operation_id integer);
DROP FUNCTION public.click_protection_enabled();
DROP FUNCTION public.check_bypass_click_protection();
DROP FUNCTION public.check_auto_sync();
DROP TYPE public.url_status;
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

--
-- Name: check_auto_sync(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.check_auto_sync() RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Get the current session variable
  -- The problem is that the value is empty, not 'true'
  -- So we need to check for the existence of the variable instead
  RETURN current_setting('app.is_auto_sync', TRUE) = 'true';
END;
$$;


ALTER FUNCTION public.check_auto_sync() OWNER TO neondb_owner;

--
-- Name: check_bypass_click_protection(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.check_bypass_click_protection() RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Try to get the session variable
  RETURN NULLIF(current_setting('app.bypass_click_protection', TRUE), '')::BOOLEAN;
EXCEPTION
  WHEN OTHERS THEN
    -- Default to false if variable doesn't exist
    RETURN FALSE;
END;
$$;


ALTER FUNCTION public.check_bypass_click_protection() OWNER TO neondb_owner;

--
-- Name: click_protection_enabled(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.click_protection_enabled() RETURNS boolean
    LANGUAGE plpgsql
    AS $$
        BEGIN
          RETURN (SELECT value FROM protection_settings WHERE key = 'click_protection_enabled');
        END;
        $$;


ALTER FUNCTION public.click_protection_enabled() OWNER TO neondb_owner;

--
-- Name: end_auto_sync(integer); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.end_auto_sync(operation_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
        BEGIN
          UPDATE sync_operations
          SET completed_at = NOW()
          WHERE id = operation_id;
        END;
        $$;


ALTER FUNCTION public.end_auto_sync(operation_id integer) OWNER TO neondb_owner;

--
-- Name: is_auto_sync(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.is_auto_sync() RETURNS boolean
    LANGUAGE plpgsql
    AS $$
        BEGIN
          RETURN EXISTS (
            SELECT 1 FROM sync_operations 
            WHERE is_auto_sync = TRUE AND completed_at IS NULL
          );
        END;
        $$;


ALTER FUNCTION public.is_auto_sync() OWNER TO neondb_owner;

--
-- Name: prevent_auto_click_updates(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.prevent_auto_click_updates() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
          -- If this is an automatic sync operation
          IF click_protection_enabled() AND is_auto_sync() THEN
            -- Restore the original click_limit value if it was changed
            IF NEW.click_limit IS DISTINCT FROM OLD.click_limit THEN
              RAISE WARNING 'Preventing automatic update to click_limit (from % to %) for URL %', 
                OLD.click_limit, NEW.click_limit, NEW.id;
              NEW.click_limit := OLD.click_limit;
            END IF;
            
            -- Restore the original clicks value if it was changed
            IF NEW.clicks IS DISTINCT FROM OLD.clicks THEN
              RAISE WARNING 'Preventing automatic update to clicks (from % to %) for URL %', 
                OLD.clicks, NEW.clicks, NEW.id;
              NEW.clicks := OLD.clicks;
            END IF;
            
            -- Restore the original original_click_limit value if it was changed
            IF NEW.original_click_limit IS DISTINCT FROM OLD.original_click_limit THEN
              RAISE WARNING 'Preventing automatic update to original_click_limit (from % to %) for URL %', 
                OLD.original_click_limit, NEW.original_click_limit, NEW.id;
              NEW.original_click_limit := OLD.original_click_limit;
            END IF;
          END IF;
          
          RETURN NEW;
        END;
        $$;


ALTER FUNCTION public.prevent_auto_click_updates() OWNER TO neondb_owner;

--
-- Name: prevent_campaign_auto_click_updates(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.prevent_campaign_auto_click_updates() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
          -- If this is an automatic sync operation
          IF click_protection_enabled() AND is_auto_sync() THEN
            -- Restore the original total_clicks value if it was changed
            IF NEW.total_clicks IS DISTINCT FROM OLD.total_clicks THEN
              RAISE WARNING 'Preventing automatic update to total_clicks (from % to %) for campaign %', 
                OLD.total_clicks, NEW.total_clicks, NEW.id;
              NEW.total_clicks := OLD.total_clicks;
            END IF;
          END IF;
          
          RETURN NEW;
        END;
        $$;


ALTER FUNCTION public.prevent_campaign_auto_click_updates() OWNER TO neondb_owner;

--
-- Name: prevent_test_auto_clicks_updates(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.prevent_test_auto_clicks_updates() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
          BEGIN
            -- If we're in an auto-sync context and someone is trying to change the clicks value,
            -- reject the update by returning NULL
            IF (is_auto_sync() AND NEW.clicks IS DISTINCT FROM OLD.clicks) THEN
              RAISE NOTICE 'Blocked auto-update of clicks: % -> %', OLD.clicks, NEW.clicks;
              RETURN NULL;
            END IF;
            
            -- For any other case, allow the update
            RETURN NEW;
          END;
          $$;


ALTER FUNCTION public.prevent_test_auto_clicks_updates() OWNER TO neondb_owner;

--
-- Name: prevent_unauthorized_click_updates(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.prevent_unauthorized_click_updates() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
          -- If protection bypass is enabled (click protection is disabled),
          -- allow all updates to go through (this handles Original URL Records updates)
          IF NOT (SELECT value FROM protection_settings WHERE key = 'click_protection_enabled') THEN
            -- Bypass enabled, allow all updates
            RETURN NEW;
          END IF;
          
          -- If we get here, click protection is enabled (bypass is not enabled)
          -- We still want click_limit to be updatable for multiplier changes, etc.
          -- But we never want original_click_limit to change unless bypass is enabled
          
          -- Check if original click limit is being changed - never allow this without bypass
          IF NEW.original_click_limit IS DISTINCT FROM OLD.original_click_limit THEN
            RAISE WARNING 'Preventing unauthorized update to original_click_limit (from % to %) for URL %', 
              OLD.original_click_limit, NEW.original_click_limit, NEW.id;
            NEW.original_click_limit := OLD.original_click_limit;
          END IF;
          
          RETURN NEW;
        END;
        $$;


ALTER FUNCTION public.prevent_unauthorized_click_updates() OWNER TO neondb_owner;

--
-- Name: protect_original_click_values(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.protect_original_click_values() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Allow changes from our API endpoint (checking context via environment)
  IF current_setting('app.original_click_update', TRUE) = 'true' THEN
    -- This is intentional change from our API, allow it
    RETURN NEW;
  END IF;
  
  -- For all other changes (from campaigns, URL page, etc.)
  -- If the original_click_limit is being changed, keep original value
  IF NEW.original_click_limit IS DISTINCT FROM OLD.original_click_limit THEN
    -- Keep the original value
    NEW.original_click_limit := OLD.original_click_limit;
  END IF;
  
  -- If click_limit was reset to match original_click_limit, that's good
  IF NEW.click_limit = OLD.original_click_limit THEN
    -- This is valid, allow it
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.protect_original_click_values() OWNER TO neondb_owner;

--
-- Name: start_auto_sync(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.start_auto_sync() RETURNS integer
    LANGUAGE plpgsql
    AS $$
        DECLARE
          operation_id INTEGER;
        BEGIN
          INSERT INTO sync_operations (is_auto_sync) 
          VALUES (TRUE) 
          RETURNING id INTO operation_id;
          
          RETURN operation_id;
        END;
        $$;


ALTER FUNCTION public.start_auto_sync() OWNER TO neondb_owner;

--
-- Name: update_original_click_value(integer, integer); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_original_click_value(url_id integer, new_original_click_limit integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
        DECLARE
          current_url RECORD;
          multiplier FLOAT;
          new_click_limit INTEGER;
          result JSONB;
        BEGIN
          -- Get current URL
          SELECT id, name, original_click_limit, click_limit
          INTO current_url
          FROM urls
          WHERE id = url_id;
          
          IF current_url IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'URL not found');
          END IF;
          
          -- Calculate multiplier if any exists
          multiplier := 1;
          IF current_url.original_click_limit > 0 AND current_url.click_limit > current_url.original_click_limit THEN
            -- PostgreSQL ROUND takes numeric type for second parameter, not integer
            multiplier := ROUND(current_url.click_limit::float / current_url.original_click_limit::float);
          END IF;
          
          -- Log what we're doing
          RAISE NOTICE 'URL %: Changing original_click_limit from % to % with multiplier %', 
            url_id, current_url.original_click_limit, new_original_click_limit, multiplier;
          
          -- Apply multiplier to new limit
          new_click_limit := new_original_click_limit * multiplier;
          
          -- Temporarily disable protection
          UPDATE protection_settings
          SET value = FALSE
          WHERE key = 'click_protection_enabled';
          
          -- Update URL
          UPDATE urls
          SET original_click_limit = new_original_click_limit,
              click_limit = new_click_limit,
              updated_at = NOW()
          WHERE id = url_id;
          
          -- Re-enable protection
          UPDATE protection_settings
          SET value = TRUE
          WHERE key = 'click_protection_enabled';
          
          -- Return success
          RETURN jsonb_build_object(
            'success', true,
            'message', 'Original click value updated',
            'url', jsonb_build_object(
              'id', url_id,
              'name', current_url.name,
              'original_click_limit', new_original_click_limit,
              'click_limit', new_click_limit,
              'multiplier', multiplier
            )
          );
        END;
        $$;


ALTER FUNCTION public.update_original_click_value(url_id integer, new_original_click_limit integer) OWNER TO neondb_owner;

--
-- Name: update_original_url_records_updated_at(); Type: FUNCTION; Schema: public; Owner: neondb_owner
--

CREATE FUNCTION public.update_original_url_records_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_original_url_records_updated_at() OWNER TO neondb_owner;

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
-- Name: campaign_click_records; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.campaign_click_records (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    url_id integer,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    ip_address text,
    user_agent text,
    referer text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.campaign_click_records OWNER TO neondb_owner;

--
-- Name: campaign_click_records_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.campaign_click_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.campaign_click_records_id_seq OWNER TO neondb_owner;

--
-- Name: campaign_click_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.campaign_click_records_id_seq OWNED BY public.campaign_click_records.id;


--
-- Name: campaign_redirect_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.campaign_redirect_logs (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    url_id integer,
    redirect_time timestamp without time zone DEFAULT now() NOT NULL,
    indian_time text NOT NULL,
    date_key text NOT NULL,
    hour_key integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.campaign_redirect_logs OWNER TO neondb_owner;

--
-- Name: campaign_redirect_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.campaign_redirect_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.campaign_redirect_logs_id_seq OWNER TO neondb_owner;

--
-- Name: campaign_redirect_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.campaign_redirect_logs_id_seq OWNED BY public.campaign_redirect_logs.id;


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
    last_spent_check timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    traffic_sender_enabled boolean DEFAULT false,
    last_traffic_sender_action timestamp without time zone,
    last_traffic_sender_status text,
    last_budget_update_time timestamp without time zone,
    traffic_generator_enabled boolean DEFAULT false,
    traffic_generator_state text DEFAULT 'idle'::text,
    traffic_generator_wait_start_time timestamp without time zone,
    traffic_generator_wait_minutes integer DEFAULT 2,
    budgeted_url_ids integer[] DEFAULT '{}'::integer[],
    pending_url_budgets jsonb DEFAULT '{}'::jsonb,
    post_pause_check_minutes integer DEFAULT 2
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
-- Name: click_analytics; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.click_analytics (
    id integer NOT NULL,
    "urlId" integer NOT NULL,
    "campaignId" integer NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userAgent" text,
    "ipAddress" text,
    referer text,
    country text,
    city text,
    "deviceType" text,
    browser text,
    "operatingSystem" text
);


ALTER TABLE public.click_analytics OWNER TO neondb_owner;

--
-- Name: click_analytics_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.click_analytics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.click_analytics_id_seq OWNER TO neondb_owner;

--
-- Name: click_analytics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.click_analytics_id_seq OWNED BY public.click_analytics.id;


--
-- Name: click_protection_test; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.click_protection_test (
    id integer NOT NULL,
    name text NOT NULL,
    clicks integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.click_protection_test OWNER TO neondb_owner;

--
-- Name: click_protection_test_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.click_protection_test_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.click_protection_test_id_seq OWNER TO neondb_owner;

--
-- Name: click_protection_test_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.click_protection_test_id_seq OWNED BY public.click_protection_test.id;


--
-- Name: original_url_records; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.original_url_records (
    id integer NOT NULL,
    name text NOT NULL,
    target_url text NOT NULL,
    original_click_limit integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL
);


ALTER TABLE public.original_url_records OWNER TO neondb_owner;

--
-- Name: original_url_records_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.original_url_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.original_url_records_id_seq OWNER TO neondb_owner;

--
-- Name: original_url_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.original_url_records_id_seq OWNED BY public.original_url_records.id;


--
-- Name: protection_settings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.protection_settings (
    key text NOT NULL,
    value boolean NOT NULL
);


ALTER TABLE public.protection_settings OWNER TO neondb_owner;

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
-- Name: sync_operations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.sync_operations (
    id integer NOT NULL,
    is_auto_sync boolean DEFAULT false NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


ALTER TABLE public.sync_operations OWNER TO neondb_owner;

--
-- Name: sync_operations_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.sync_operations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sync_operations_id_seq OWNER TO neondb_owner;

--
-- Name: sync_operations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.sync_operations_id_seq OWNED BY public.sync_operations.id;


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
-- Name: url_click_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.url_click_logs (
    id integer NOT NULL,
    url_id integer NOT NULL,
    log_entry text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    click_time timestamp with time zone,
    indian_time text,
    date_key text,
    hour_key integer
);


ALTER TABLE public.url_click_logs OWNER TO neondb_owner;

--
-- Name: url_click_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.url_click_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.url_click_logs_id_seq OWNER TO neondb_owner;

--
-- Name: url_click_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.url_click_logs_id_seq OWNED BY public.url_click_logs.id;


--
-- Name: url_click_records; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.url_click_records (
    id integer NOT NULL,
    url_id integer NOT NULL,
    ip_address text,
    user_agent text,
    referer text,
    click_time timestamp with time zone DEFAULT now()
);


ALTER TABLE public.url_click_records OWNER TO neondb_owner;

--
-- Name: url_click_records_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.url_click_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.url_click_records_id_seq OWNER TO neondb_owner;

--
-- Name: url_click_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.url_click_records_id_seq OWNED BY public.url_click_records.id;


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
-- Name: campaign_click_records id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaign_click_records ALTER COLUMN id SET DEFAULT nextval('public.campaign_click_records_id_seq'::regclass);


--
-- Name: campaign_redirect_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaign_redirect_logs ALTER COLUMN id SET DEFAULT nextval('public.campaign_redirect_logs_id_seq'::regclass);


--
-- Name: campaigns id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaigns ALTER COLUMN id SET DEFAULT nextval('public.campaigns_id_seq'::regclass);


--
-- Name: click_analytics id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.click_analytics ALTER COLUMN id SET DEFAULT nextval('public.click_analytics_id_seq'::regclass);


--
-- Name: click_protection_test id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.click_protection_test ALTER COLUMN id SET DEFAULT nextval('public.click_protection_test_id_seq'::regclass);


--
-- Name: original_url_records id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.original_url_records ALTER COLUMN id SET DEFAULT nextval('public.original_url_records_id_seq'::regclass);


--
-- Name: sync_operations id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sync_operations ALTER COLUMN id SET DEFAULT nextval('public.sync_operations_id_seq'::regclass);


--
-- Name: trafficstar_campaigns id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.trafficstar_campaigns ALTER COLUMN id SET DEFAULT nextval('public.trafficstar_campaigns_id_seq'::regclass);


--
-- Name: trafficstar_credentials id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.trafficstar_credentials ALTER COLUMN id SET DEFAULT nextval('public.trafficstar_credentials_id_seq'::regclass);


--
-- Name: url_click_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.url_click_logs ALTER COLUMN id SET DEFAULT nextval('public.url_click_logs_id_seq'::regclass);


--
-- Name: url_click_records id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.url_click_records ALTER COLUMN id SET DEFAULT nextval('public.url_click_records_id_seq'::regclass);


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
-- Name: campaign_click_records campaign_click_records_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaign_click_records
    ADD CONSTRAINT campaign_click_records_pkey PRIMARY KEY (id);


--
-- Name: campaign_redirect_logs campaign_redirect_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaign_redirect_logs
    ADD CONSTRAINT campaign_redirect_logs_pkey PRIMARY KEY (id);


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
-- Name: click_analytics click_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.click_analytics
    ADD CONSTRAINT click_analytics_pkey PRIMARY KEY (id);


--
-- Name: click_protection_test click_protection_test_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.click_protection_test
    ADD CONSTRAINT click_protection_test_pkey PRIMARY KEY (id);


--
-- Name: original_url_records original_url_records_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.original_url_records
    ADD CONSTRAINT original_url_records_name_key UNIQUE (name);


--
-- Name: original_url_records original_url_records_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.original_url_records
    ADD CONSTRAINT original_url_records_pkey PRIMARY KEY (id);


--
-- Name: protection_settings protection_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.protection_settings
    ADD CONSTRAINT protection_settings_pkey PRIMARY KEY (key);


--
-- Name: sessions session_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: sync_operations sync_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sync_operations
    ADD CONSTRAINT sync_operations_pkey PRIMARY KEY (id);


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
-- Name: url_click_logs url_click_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.url_click_logs
    ADD CONSTRAINT url_click_logs_pkey PRIMARY KEY (id);


--
-- Name: url_click_records url_click_records_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.url_click_records
    ADD CONSTRAINT url_click_records_pkey PRIMARY KEY (id);


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
-- Name: idx_campaign_click_records_campaign_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_campaign_click_records_campaign_id ON public.campaign_click_records USING btree (campaign_id);


--
-- Name: idx_campaign_click_records_timestamp; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_campaign_click_records_timestamp ON public.campaign_click_records USING btree ("timestamp");


--
-- Name: idx_campaign_click_records_url_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_campaign_click_records_url_id ON public.campaign_click_records USING btree (url_id);


--
-- Name: idx_campaigns_traffic_sender_enabled; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX idx_campaigns_traffic_sender_enabled ON public.campaigns USING btree (traffic_sender_enabled);


--
-- Name: original_url_records_name_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX original_url_records_name_idx ON public.original_url_records USING btree (name);


--
-- Name: url_click_logs_url_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX url_click_logs_url_id_idx ON public.url_click_logs USING btree (url_id);


--
-- Name: url_click_records_url_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX url_click_records_url_id_idx ON public.url_click_records USING btree (url_id);


--
-- Name: urls prevent_auto_click_update_trigger; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER prevent_auto_click_update_trigger BEFORE UPDATE ON public.urls FOR EACH ROW EXECUTE FUNCTION public.prevent_auto_click_updates();


--
-- Name: campaigns prevent_campaign_auto_click_update_trigger; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER prevent_campaign_auto_click_update_trigger BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.prevent_campaign_auto_click_updates();


--
-- Name: click_protection_test prevent_test_auto_click_update_trigger; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER prevent_test_auto_click_update_trigger BEFORE UPDATE ON public.click_protection_test FOR EACH ROW EXECUTE FUNCTION public.prevent_test_auto_clicks_updates();


--
-- Name: urls protect_original_click_values_trigger; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER protect_original_click_values_trigger BEFORE UPDATE ON public.urls FOR EACH ROW EXECUTE FUNCTION public.protect_original_click_values();


--
-- Name: original_url_records update_original_url_records_trigger; Type: TRIGGER; Schema: public; Owner: neondb_owner
--

CREATE TRIGGER update_original_url_records_trigger BEFORE UPDATE ON public.original_url_records FOR EACH ROW EXECUTE FUNCTION public.update_original_url_records_updated_at();


--
-- Name: click_analytics click_analytics_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.click_analytics
    ADD CONSTRAINT "click_analytics_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: click_analytics click_analytics_urlId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.click_analytics
    ADD CONSTRAINT "click_analytics_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES public.urls(id) ON DELETE CASCADE;


--
-- Name: url_click_logs url_click_logs_url_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.url_click_logs
    ADD CONSTRAINT url_click_logs_url_id_fkey FOREIGN KEY (url_id) REFERENCES public.urls(id);


--
-- Name: url_click_records url_click_records_url_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.url_click_records
    ADD CONSTRAINT url_click_records_url_id_fkey FOREIGN KEY (url_id) REFERENCES public.urls(id);


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

