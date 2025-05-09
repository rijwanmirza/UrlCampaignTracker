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
-- Name: campaign_monitoring; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.campaign_monitoring (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    trafficstar_campaign_id text NOT NULL,
    type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.campaign_monitoring OWNER TO neondb_owner;

--
-- Name: campaign_monitoring_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.campaign_monitoring_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.campaign_monitoring_id_seq OWNER TO neondb_owner;

--
-- Name: campaign_monitoring_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.campaign_monitoring_id_seq OWNED BY public.campaign_monitoring.id;


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
    post_pause_check_minutes integer DEFAULT 2,
    high_spend_wait_minutes integer DEFAULT 11,
    high_spend_budget_calc_time timestamp without time zone,
    youtube_api_enabled boolean DEFAULT false,
    youtube_api_interval_minutes integer DEFAULT 60,
    youtube_api_last_check timestamp without time zone,
    youtube_check_country_restriction boolean DEFAULT true,
    youtube_check_private boolean DEFAULT true,
    youtube_check_deleted boolean DEFAULT true,
    youtube_check_age_restricted boolean DEFAULT true,
    youtube_check_made_for_kids boolean DEFAULT true,
    youtube_check_duration boolean DEFAULT false,
    youtube_max_duration_minutes integer DEFAULT 30,
    pending_budget_update boolean DEFAULT false,
    minimum_clicks_threshold integer DEFAULT 5000,
    remaining_clicks_threshold integer DEFAULT 15000
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
-- Name: gmail_campaign_assignments; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.gmail_campaign_assignments (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    min_click_quantity integer DEFAULT 1 NOT NULL,
    max_click_quantity integer DEFAULT 1000000000 NOT NULL,
    priority integer DEFAULT 1 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.gmail_campaign_assignments OWNER TO neondb_owner;

--
-- Name: gmail_campaign_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.gmail_campaign_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gmail_campaign_assignments_id_seq OWNER TO neondb_owner;

--
-- Name: gmail_campaign_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.gmail_campaign_assignments_id_seq OWNED BY public.gmail_campaign_assignments.id;


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
-- Name: system_settings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    name text NOT NULL,
    value text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.system_settings OWNER TO neondb_owner;

--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.system_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.system_settings_id_seq OWNER TO neondb_owner;

--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


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
    original_click_limit integer DEFAULT 0 NOT NULL,
    pending_budget_update boolean DEFAULT false NOT NULL,
    budget_calculated boolean DEFAULT false NOT NULL
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
-- Name: youtube_api_logs; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.youtube_api_logs (
    id integer NOT NULL,
    log_type text NOT NULL,
    message text NOT NULL,
    campaign_id integer,
    details jsonb,
    is_error boolean DEFAULT false,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.youtube_api_logs OWNER TO neondb_owner;

--
-- Name: youtube_api_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.youtube_api_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.youtube_api_logs_id_seq OWNER TO neondb_owner;

--
-- Name: youtube_api_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.youtube_api_logs_id_seq OWNED BY public.youtube_api_logs.id;


--
-- Name: youtube_url_records; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.youtube_url_records (
    id integer NOT NULL,
    url_id integer,
    campaign_id integer NOT NULL,
    name text NOT NULL,
    target_url text NOT NULL,
    youtube_video_id text NOT NULL,
    deletion_reason text NOT NULL,
    country_restricted boolean DEFAULT false,
    private_video boolean DEFAULT false,
    deleted_video boolean DEFAULT false,
    age_restricted boolean DEFAULT false,
    made_for_kids boolean DEFAULT false,
    deleted_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    exceeded_duration boolean DEFAULT false
);


ALTER TABLE public.youtube_url_records OWNER TO neondb_owner;

--
-- Name: youtube_url_records_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.youtube_url_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.youtube_url_records_id_seq OWNER TO neondb_owner;

--
-- Name: youtube_url_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.youtube_url_records_id_seq OWNED BY public.youtube_url_records.id;


--
-- Name: api_error_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.api_error_logs ALTER COLUMN id SET DEFAULT nextval('public.api_error_logs_id_seq'::regclass);


--
-- Name: campaign_click_records id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaign_click_records ALTER COLUMN id SET DEFAULT nextval('public.campaign_click_records_id_seq'::regclass);


--
-- Name: campaign_monitoring id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaign_monitoring ALTER COLUMN id SET DEFAULT nextval('public.campaign_monitoring_id_seq'::regclass);


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
-- Name: gmail_campaign_assignments id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.gmail_campaign_assignments ALTER COLUMN id SET DEFAULT nextval('public.gmail_campaign_assignments_id_seq'::regclass);


--
-- Name: original_url_records id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.original_url_records ALTER COLUMN id SET DEFAULT nextval('public.original_url_records_id_seq'::regclass);


--
-- Name: sync_operations id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.sync_operations ALTER COLUMN id SET DEFAULT nextval('public.sync_operations_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


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
-- Name: youtube_api_logs id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.youtube_api_logs ALTER COLUMN id SET DEFAULT nextval('public.youtube_api_logs_id_seq'::regclass);


--
-- Name: youtube_url_records id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.youtube_url_records ALTER COLUMN id SET DEFAULT nextval('public.youtube_url_records_id_seq'::regclass);


--
-- Data for Name: api_error_logs; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.api_error_logs (id, endpoint, method, request_body, error_message, error_details, status_code, campaign_id, action_type, retry_count, resolved, resolved_at, created_at, updated_at) FROM stdin;
1	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	1	f	\N	2025-04-25 18:40:45.537	2025-04-25 18:40:45.537
2	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	1	f	\N	2025-04-25 18:40:47.77	2025-04-25 18:40:47.77
3	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	3	f	\N	2025-04-25 18:40:52.935	2025-04-25 18:40:52.935
4	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	3	f	\N	2025-04-25 18:40:54.824	2025-04-25 18:40:54.824
5	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	1	f	\N	2025-04-25 18:40:55.645	2025-04-25 18:40:55.645
6	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	3	f	\N	2025-04-25 18:41:02.734	2025-04-25 18:41:02.734
7	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	1	f	\N	2025-04-25 18:42:12.681	2025-04-25 18:42:12.681
8	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	3	f	\N	2025-04-25 18:42:19.717	2025-04-25 18:42:19.717
9	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	1	f	\N	2025-04-25 18:42:20.532	2025-04-25 18:42:20.532
10	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	1	f	\N	2025-04-25 18:42:25.597	2025-04-25 18:42:25.597
11	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	3	f	\N	2025-04-25 18:42:28.065	2025-04-25 18:42:28.065
12	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	3	f	\N	2025-04-25 18:42:33.023	2025-04-25 18:42:33.023
13	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	1	f	\N	2025-04-25 18:42:33.832	2025-04-25 18:42:33.832
14	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	3	f	\N	2025-04-25 18:42:40.867	2025-04-25 18:42:40.867
15	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	1	f	\N	2025-04-25 18:43:17.179	2025-04-25 18:43:17.179
16	https://api.trafficstars.com/v1.1/campaigns/988498/stats	GET	\N	Failed to obtain TrafficStar API token	"{\\"stack\\":\\"Error: Failed to obtain TrafficStar API token\\\\n    at TrafficStarService.ensureToken (/home/runner/workspace/server/trafficstar-service.ts:177:13)\\\\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\\"}"	0	988498	get_spent_value	3	f	\N	2025-04-25 18:43:24.86	2025-04-25 18:43:24.86
\.


--
-- Data for Name: campaign_click_records; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.campaign_click_records (id, campaign_id, url_id, "timestamp", ip_address, user_agent, referer, created_at) FROM stdin;
1	1	2	2025-05-07 17:20:18.239	\N	\N	\N	2025-05-07 17:20:18.252851
2	1	2	2025-05-07 17:22:03.049	\N	\N	\N	2025-05-07 17:22:03.061015
3	1	2	2025-05-07 17:22:27.325	\N	\N	\N	2025-05-07 17:22:27.337118
4	1	2	2025-05-07 17:22:47.735	\N	\N	\N	2025-05-07 17:22:47.746023
5	2	23	2025-05-08 05:30:33.635	\N	\N	\N	2025-05-08 05:30:33.649068
6	1	139	2025-05-09 09:26:11.321	\N	\N	\N	2025-05-09 09:26:11.323266
7	1	139	2025-05-09 09:26:16.713	\N	\N	\N	2025-05-09 09:26:16.71706
8	1	139	2025-05-09 09:26:17.907	\N	\N	\N	2025-05-09 09:26:17.909522
9	1	139	2025-05-09 09:26:19.4	\N	\N	\N	2025-05-09 09:26:19.402633
10	1	139	2025-05-09 09:26:21.059	\N	\N	\N	2025-05-09 09:26:21.060895
11	1	139	2025-05-09 09:26:22.607	\N	\N	\N	2025-05-09 09:26:22.60962
12	1	139	2025-05-09 09:26:23.727	\N	\N	\N	2025-05-09 09:26:23.730317
13	1	139	2025-05-09 09:26:26.957	\N	\N	\N	2025-05-09 09:26:26.958988
14	1	139	2025-05-09 09:26:28.456	\N	\N	\N	2025-05-09 09:26:28.460146
15	1	139	2025-05-09 09:26:31.121	\N	\N	\N	2025-05-09 09:26:31.12353
16	1	139	2025-05-09 09:26:32.423	\N	\N	\N	2025-05-09 09:26:32.425951
17	1	139	2025-05-09 09:26:33.968	\N	\N	\N	2025-05-09 09:26:33.970965
18	1	139	2025-05-09 09:26:35.198	\N	\N	\N	2025-05-09 09:26:35.200639
\.


--
-- Data for Name: campaign_monitoring; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.campaign_monitoring (id, campaign_id, trafficstar_campaign_id, type, is_active, added_at, updated_at) FROM stdin;
1	1	995224	active_status	f	2025-05-09 10:51:23.883	2025-05-09 11:14:23.02
\.


--
-- Data for Name: campaign_redirect_logs; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.campaign_redirect_logs (id, campaign_id, url_id, redirect_time, indian_time, date_key, hour_key, created_at) FROM stdin;
1	6	70	2025-04-29 16:54:50.302	2025-04-29 22:24:50	2025-04-29	22	2025-04-29 16:54:50.313778
2	6	70	2025-04-29 16:54:50.349	2025-04-29 22:24:50	2025-04-29	22	2025-04-29 16:54:50.360787
3	6	70	2025-04-29 16:54:50.392	2025-04-29 22:24:50	2025-04-29	22	2025-04-29 16:54:50.402922
4	6	70	2025-04-29 16:54:50.431	2025-04-29 22:24:50	2025-04-29	22	2025-04-29 16:54:50.442767
5	6	70	2025-04-29 16:54:50.469	2025-04-29 22:24:50	2025-04-29	22	2025-04-29 16:54:50.4806
6	6	70	2025-04-29 16:55:40.764	2025-04-29 22:25:40	2025-04-29	22	2025-04-29 16:55:40.835846
7	6	70	2025-04-29 16:59:56.782	2025-04-29 22:29:56	2025-04-29	22	2025-04-29 16:59:56.792873
8	6	70	2025-04-29 17:01:19.544	2025-04-29 22:31:19	2025-04-29	22	2025-04-29 17:01:19.622208
9	8	72	2025-04-29 17:08:37.064	2025-04-29 22:38:37	2025-04-29	22	2025-04-29 17:08:37.073773
10	6	70	2025-04-29 17:44:53.195	2025-04-29 23:14:53	2025-04-29	23	2025-04-29 17:44:53.206879
11	6	70	2025-04-29 17:45:16.92	2025-04-29 23:15:16	2025-04-29	23	2025-04-29 17:45:16.992926
12	8	78	2025-04-29 19:05:14.248	2025-04-30 00:35:14	2025-04-30	0	2025-04-29 19:05:14.331286
13	8	78	2025-04-29 19:06:20.261	2025-04-30 00:36:20	2025-04-30	0	2025-04-29 19:06:20.329386
14	8	78	2025-04-29 19:09:34.01	2025-04-30 00:39:34	2025-04-30	0	2025-04-29 19:09:34.024883
15	1	79	2025-04-29 19:26:53.609	2025-04-30 00:56:53	2025-04-30	0	2025-04-29 19:26:53.685853
16	8	78	2025-04-29 19:27:24.204	2025-04-30 00:57:24	2025-04-30	0	2025-04-29 19:27:24.215554
17	8	82	2025-04-30 02:32:17.399	2025-04-30 08:02:17	2025-04-30	8	2025-04-30 02:32:17.48979
18	8	84	2025-04-30 04:42:45.504	2025-04-30 10:12:45	2025-04-30	10	2025-04-30 04:42:45.580481
19	8	84	2025-04-30 04:51:11.741	2025-04-30 10:21:11	2025-04-30	10	2025-04-30 04:51:11.826776
20	8	84	2025-04-30 05:07:30.176	2025-04-30 10:37:30	2025-04-30	10	2025-04-30 05:07:30.247468
21	8	84	2025-04-30 05:07:47.696	2025-04-30 10:37:47	2025-04-30	10	2025-04-30 05:07:47.76991
22	8	84	2025-04-30 05:08:12.071	2025-04-30 10:38:12	2025-04-30	10	2025-04-30 05:08:12.155071
23	8	84	2025-04-30 05:09:44.09	2025-04-30 10:39:44	2025-04-30	10	2025-04-30 05:09:44.182826
24	8	85	2025-04-30 05:11:43.094	2025-04-30 10:41:43	2025-04-30	10	2025-04-30 05:11:43.162478
25	9	86	2025-04-30 05:20:31.723	2025-04-30 10:50:31	2025-04-30	10	2025-04-30 05:20:31.8146
26	9	86	2025-04-30 05:32:39.679	2025-04-30 11:02:39	2025-04-30	11	2025-04-30 05:32:39.691116
27	9	493	2025-05-07 11:00:03.768	2025-05-07 16:30:03	2025-05-07	16	2025-05-07 11:00:03.868155
28	9	493	2025-05-07 11:00:10.501	2025-05-07 16:30:10	2025-05-07	16	2025-05-07 11:00:10.512623
29	9	493	2025-05-07 11:00:13.215	2025-05-07 16:30:13	2025-05-07	16	2025-05-07 11:00:13.228709
30	9	493	2025-05-07 11:00:16.555	2025-05-07 16:30:16	2025-05-07	16	2025-05-07 11:00:16.565043
31	9	493	2025-05-07 11:00:19.661	2025-05-07 16:30:19	2025-05-07	16	2025-05-07 11:00:19.672292
32	9	493	2025-05-07 11:00:22.506	2025-05-07 16:30:22	2025-05-07	16	2025-05-07 11:00:22.516323
33	9	493	2025-05-07 11:00:24.484	2025-05-07 16:30:24	2025-05-07	16	2025-05-07 11:00:24.497136
34	9	494	2025-05-07 11:08:49.048	2025-05-07 16:38:49	2025-05-07	16	2025-05-07 11:08:49.124026
35	9	494	2025-05-07 11:08:50.428	2025-05-07 16:38:50	2025-05-07	16	2025-05-07 11:08:50.438903
36	9	494	2025-05-07 11:08:54.835	2025-05-07 16:38:54	2025-05-07	16	2025-05-07 11:08:54.846304
37	9	494	2025-05-07 11:09:00.016	2025-05-07 16:39:00	2025-05-07	16	2025-05-07 11:09:00.026826
38	9	494	2025-05-07 11:09:03.1	2025-05-07 16:39:03	2025-05-07	16	2025-05-07 11:09:03.110709
39	9	494	2025-05-07 11:09:07.241	2025-05-07 16:39:07	2025-05-07	16	2025-05-07 11:09:07.252383
40	9	494	2025-05-07 11:09:10.151	2025-05-07 16:39:10	2025-05-07	16	2025-05-07 11:09:10.160984
41	9	494	2025-05-07 11:09:12.9	2025-05-07 16:39:12	2025-05-07	16	2025-05-07 11:09:12.910037
42	9	494	2025-05-07 11:09:14.738	2025-05-07 16:39:14	2025-05-07	16	2025-05-07 11:09:14.748004
43	9	494	2025-05-07 11:09:16.758	2025-05-07 16:39:16	2025-05-07	16	2025-05-07 11:09:16.767786
44	9	494	2025-05-07 11:09:19.303	2025-05-07 16:39:19	2025-05-07	16	2025-05-07 11:09:19.313061
45	9	494	2025-05-07 11:09:21.59	2025-05-07 16:39:21	2025-05-07	16	2025-05-07 11:09:21.600475
46	9	494	2025-05-07 11:09:23.875	2025-05-07 16:39:23	2025-05-07	16	2025-05-07 11:09:23.88794
47	9	494	2025-05-07 11:09:26.579	2025-05-07 16:39:26	2025-05-07	16	2025-05-07 11:09:26.591942
48	9	494	2025-05-07 11:09:30.896	2025-05-07 16:39:30	2025-05-07	16	2025-05-07 11:09:30.90657
49	9	494	2025-05-07 11:09:36.832	2025-05-07 16:39:36	2025-05-07	16	2025-05-07 11:09:36.841589
50	9	494	2025-05-07 11:09:41.676	2025-05-07 16:39:41	2025-05-07	16	2025-05-07 11:09:41.687133
51	9	494	2025-05-07 11:09:45.941	2025-05-07 16:39:45	2025-05-07	16	2025-05-07 11:09:45.951364
52	9	494	2025-05-07 11:09:48.803	2025-05-07 16:39:48	2025-05-07	16	2025-05-07 11:09:48.813674
53	9	494	2025-05-07 11:09:56.567	2025-05-07 16:39:56	2025-05-07	16	2025-05-07 11:09:56.57714
54	9	494	2025-05-07 11:09:59.325	2025-05-07 16:39:59	2025-05-07	16	2025-05-07 11:09:59.336234
55	9	494	2025-05-07 11:10:02.897	2025-05-07 16:40:02	2025-05-07	16	2025-05-07 11:10:02.908068
56	9	494	2025-05-07 11:10:04.757	2025-05-07 16:40:04	2025-05-07	16	2025-05-07 11:10:04.768815
57	9	494	2025-05-07 11:10:08.017	2025-05-07 16:40:08	2025-05-07	16	2025-05-07 11:10:08.026635
58	9	494	2025-05-07 11:10:11.663	2025-05-07 16:40:11	2025-05-07	16	2025-05-07 11:10:11.673532
59	9	495	2025-05-07 11:31:11.334	2025-05-07 17:01:11	2025-05-07	17	2025-05-07 11:31:11.403496
60	9	496	2025-05-07 11:45:14.36	2025-05-07 17:15:14	2025-05-07	17	2025-05-07 11:45:14.439516
61	9	496	2025-05-07 11:45:23.35	2025-05-07 17:15:23	2025-05-07	17	2025-05-07 11:45:23.362073
62	9	496	2025-05-07 11:45:33.019	2025-05-07 17:15:33	2025-05-07	17	2025-05-07 11:45:33.029783
63	9	496	2025-05-07 11:45:43.555	2025-05-07 17:15:43	2025-05-07	17	2025-05-07 11:45:43.622908
64	9	496	2025-05-07 11:45:58.187	2025-05-07 17:15:58	2025-05-07	17	2025-05-07 11:45:58.245151
65	9	496	2025-05-07 11:46:05.59	2025-05-07 17:16:05	2025-05-07	17	2025-05-07 11:46:05.599651
66	9	496	2025-05-07 11:46:14.125	2025-05-07 17:16:14	2025-05-07	17	2025-05-07 11:46:14.134355
67	9	497	2025-05-07 11:56:31.909	2025-05-07 17:26:31	2025-05-07	17	2025-05-07 11:56:31.975581
68	9	497	2025-05-07 11:56:33.539	2025-05-07 17:26:33	2025-05-07	17	2025-05-07 11:56:33.550049
69	9	497	2025-05-07 11:56:38.415	2025-05-07 17:26:38	2025-05-07	17	2025-05-07 11:56:38.424999
70	9	497	2025-05-07 11:56:41.553	2025-05-07 17:26:41	2025-05-07	17	2025-05-07 11:56:41.56187
71	9	497	2025-05-07 11:56:43.865	2025-05-07 17:26:43	2025-05-07	17	2025-05-07 11:56:43.874177
72	9	497	2025-05-07 11:56:46.314	2025-05-07 17:26:46	2025-05-07	17	2025-05-07 11:56:46.323965
73	9	497	2025-05-07 11:56:48.833	2025-05-07 17:26:48	2025-05-07	17	2025-05-07 11:56:48.84258
74	9	497	2025-05-07 11:57:29.754	2025-05-07 17:27:29	2025-05-07	17	2025-05-07 11:57:29.829569
75	9	497	2025-05-07 11:57:34.097	2025-05-07 17:27:34	2025-05-07	17	2025-05-07 11:57:34.106098
76	9	497	2025-05-07 11:57:45.056	2025-05-07 17:27:45	2025-05-07	17	2025-05-07 11:57:45.124848
77	9	497	2025-05-07 11:57:49.201	2025-05-07 17:27:49	2025-05-07	17	2025-05-07 11:57:49.212364
78	9	497	2025-05-07 11:57:52.75	2025-05-07 17:27:52	2025-05-07	17	2025-05-07 11:57:52.761048
79	9	497	2025-05-07 11:57:54.841	2025-05-07 17:27:54	2025-05-07	17	2025-05-07 11:57:54.853276
80	9	497	2025-05-07 11:57:58.998	2025-05-07 17:27:58	2025-05-07	17	2025-05-07 11:57:59.008926
81	9	497	2025-05-07 12:04:39.255	2025-05-07 17:34:39	2025-05-07	17	2025-05-07 12:04:39.36246
82	9	497	2025-05-07 12:04:39.575	2025-05-07 17:34:39	2025-05-07	17	2025-05-07 12:04:39.583928
84	9	497	2025-05-07 12:04:50.668	2025-05-07 17:34:50	2025-05-07	17	2025-05-07 12:04:50.67827
83	9	497	2025-05-07 12:04:46.528	2025-05-07 17:34:46	2025-05-07	17	2025-05-07 12:04:46.538407
85	9	497	2025-05-07 12:05:05.038	2025-05-07 17:35:05	2025-05-07	17	2025-05-07 12:05:05.10277
86	9	497	2025-05-07 12:05:47.976	2025-05-07 17:35:47	2025-05-07	17	2025-05-07 12:05:48.041069
87	9	497	2025-05-07 12:06:03.031	2025-05-07 17:36:03	2025-05-07	17	2025-05-07 12:06:03.104022
88	9	497	2025-05-07 12:06:17.699	2025-05-07 17:36:17	2025-05-07	17	2025-05-07 12:06:17.773811
89	9	497	2025-05-07 12:06:28.24	2025-05-07 17:36:28	2025-05-07	17	2025-05-07 12:06:28.30194
90	9	497	2025-05-07 12:06:32.456	2025-05-07 17:36:32	2025-05-07	17	2025-05-07 12:06:32.470955
91	9	497	2025-05-07 12:06:43.032	2025-05-07 17:36:43	2025-05-07	17	2025-05-07 12:06:43.106461
92	1	2	2025-05-07 17:20:18.239	2025-05-07 22:50:18	2025-05-07	22	2025-05-07 17:20:18.249523
93	1	2	2025-05-07 17:22:03.049	2025-05-07 22:52:03	2025-05-07	22	2025-05-07 17:22:03.133546
94	1	2	2025-05-07 17:22:27.325	2025-05-07 22:52:27	2025-05-07	22	2025-05-07 17:22:27.337887
95	1	2	2025-05-07 17:22:47.735	2025-05-07 22:52:47	2025-05-07	22	2025-05-07 17:22:47.801127
96	2	23	2025-05-08 05:30:33.635	2025-05-08 11:00:33	2025-05-08	11	2025-05-08 05:30:33.713232
97	1	139	2025-05-09 09:26:11.321	2025-05-09 14:56:11	2025-05-09	14	2025-05-09 09:26:11.379164
98	1	139	2025-05-09 09:26:16.713	2025-05-09 14:56:16	2025-05-09	14	2025-05-09 09:26:16.716657
99	1	139	2025-05-09 09:26:17.907	2025-05-09 14:56:17	2025-05-09	14	2025-05-09 09:26:17.910733
100	1	139	2025-05-09 09:26:19.4	2025-05-09 14:56:19	2025-05-09	14	2025-05-09 09:26:19.402329
101	1	139	2025-05-09 09:26:21.059	2025-05-09 14:56:21	2025-05-09	14	2025-05-09 09:26:21.061253
102	1	139	2025-05-09 09:26:22.607	2025-05-09 14:56:22	2025-05-09	14	2025-05-09 09:26:22.609327
103	1	139	2025-05-09 09:26:23.727	2025-05-09 14:56:23	2025-05-09	14	2025-05-09 09:26:23.730648
104	1	139	2025-05-09 09:26:26.957	2025-05-09 14:56:26	2025-05-09	14	2025-05-09 09:26:26.959331
105	1	139	2025-05-09 09:26:28.456	2025-05-09 14:56:28	2025-05-09	14	2025-05-09 09:26:28.459653
106	1	139	2025-05-09 09:26:31.121	2025-05-09 14:56:31	2025-05-09	14	2025-05-09 09:26:31.123238
107	1	139	2025-05-09 09:26:32.423	2025-05-09 14:56:32	2025-05-09	14	2025-05-09 09:26:32.426755
108	1	139	2025-05-09 09:26:33.969	2025-05-09 14:56:33	2025-05-09	14	2025-05-09 09:26:33.970681
109	1	139	2025-05-09 09:26:35.198	2025-05-09 14:56:35	2025-05-09	14	2025-05-09 09:26:35.20137
\.


--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.campaigns (id, name, redirect_method, custom_path, created_at, updated_at, multiplier, price_per_thousand, trafficstar_campaign_id, auto_manage_trafficstar, last_trafficstar_sync, budget_update_time, daily_spent, daily_spent_date, last_spent_check, traffic_sender_enabled, last_traffic_sender_action, last_traffic_sender_status, last_budget_update_time, traffic_generator_enabled, traffic_generator_state, traffic_generator_wait_start_time, traffic_generator_wait_minutes, budgeted_url_ids, pending_url_budgets, post_pause_check_minutes, high_spend_wait_minutes, high_spend_budget_calc_time, youtube_api_enabled, youtube_api_interval_minutes, youtube_api_last_check, youtube_check_country_restriction, youtube_check_private, youtube_check_deleted, youtube_check_age_restricted, youtube_check_made_for_kids, youtube_check_duration, youtube_max_duration_minutes, pending_budget_update, minimum_clicks_threshold, remaining_clicks_threshold) FROM stdin;
1	Test	http_307	hhhhsha	2025-05-07 16:47:48.556	2025-05-09 13:17:48.586	4.50	0.1030	995224	f	2025-05-09 11:21:46.199	17:11:00	22.9000	2025-05-09	2025-05-09 13:17:48.586	f	2025-05-09 13:12:51.655	high_spend_budget_updated	\N	t	idle	\N	2	{}	{}	1	2	2025-05-09 13:12:51.655	t	30	2025-05-09 13:01:27.499	t	t	t	t	t	t	30	f	8000	20000
2	2test	direct	fyfyf	2025-05-08 05:01:17.399	2025-05-08 08:12:03.392	1.00	0.0000	\N	f	\N	00:00:00	0.0000	2025-05-08	2025-05-08 05:01:17.410551	f	\N	\N	\N	t	idle	\N	2	{}	{}	2	1	\N	f	60	\N	t	t	t	t	t	f	30	f	5000	15000
\.


--
-- Data for Name: click_analytics; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.click_analytics (id, "urlId", "campaignId", "timestamp", "userAgent", "ipAddress", referer, country, city, "deviceType", browser, "operatingSystem") FROM stdin;
\.


--
-- Data for Name: click_protection_test; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.click_protection_test (id, name, clicks) FROM stdin;
3	Test Record	100
1	Test Record	150
4	Test Record	100
2	Test Record	150
\.


--
-- Data for Name: gmail_campaign_assignments; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.gmail_campaign_assignments (id, campaign_id, min_click_quantity, max_click_quantity, priority, active, created_at, updated_at) FROM stdin;
1	1	1	1000	1	f	2025-05-07 18:24:20.67009	2025-05-08 04:36:17.685
2	1	1001	5000	2	f	2025-05-07 18:24:27.253593	2025-05-08 04:36:19.736
\.


--
-- Data for Name: original_url_records; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.original_url_records (id, name, target_url, original_click_limit, created_at, updated_at, status) FROM stdin;
1	63810593	https://www.youtube.com/watch?v=c49p32BfEEM	30	2025-05-07 16:53:52.58+00	2025-05-07 16:53:52.58+00	active
2	Test Click Count Fix	https://portal.withorb.com/	100	2025-05-07 17:20:14.054+00	2025-05-07 18:10:24.109633+00	deleted
49	63818364	https://www.youtube.com/watch?v=D6qR_AAmmUo	12000	2025-05-08 10:28:58.46+00	2025-05-08 10:28:58.46+00	active
52	63818849	https://www.youtube.com/watch?v=2PrEKI6hx3M	2500	2025-05-08 11:34:54.084+00	2025-05-08 11:34:54.084+00	active
107	63822113	https://www.youtube.com/watch?v=PtIlp8jtSCg	1200	2025-05-08 18:39:23.65+00	2025-05-08 18:39:23.65+00	active
26	63815997	https://www.youtube.com/watch?v=op1XBM69HZY	30000	2025-05-08 05:17:22.245+00	2025-05-08 05:57:06.570775+00	active
24	63815996	https://www.youtube.com/watch?v=op1XBM69HZY	10000	2025-05-08 05:17:22.24+00	2025-05-08 05:57:06.570775+00	active
23	63815967	https://www.youtube.com/watch?v=op1XBM69HZY	1001	2025-05-08 05:12:22.335+00	2025-05-08 05:57:06.570775+00	active
27	63816221	https://www.youtube.com/watch?v=3LMxr45mUtA	8000	2025-05-08 05:47:10.204+00	2025-05-08 05:57:06.570775+00	active
28	63816376	https://www.youtube.com/watch?v=42Wd3lJRX00	8000	2025-05-08 06:07:58.623+00	2025-05-08 06:07:58.623+00	active
29	63816575	https://www.youtube.com/watch?v=_MlzedR1VW8	1000	2025-05-08 06:53:20.837+00	2025-05-08 12:30:06.308227+00	active
32	63817390	https://www.youtube.com/watch?v=7PomINCeWJM	5000	2025-05-08 08:20:12.656+00	2025-05-08 08:20:12.656+00	active
3	63810936	https://www.youtube.com/watch?v=cnzz6GG7920	500	2025-05-07 17:39:20.323+00	2025-05-07 18:27:24.526052+00	deleted
4	63810944	https://www.youtube.com/watch?v=DaObRvPgvlk	500	2025-05-07 17:39:20.329+00	2025-05-07 18:27:24.526052+00	deleted
5	63810935	https://www.youtube.com/watch?v=EdHwe8eaRxw	500	2025-05-07 17:39:20.335+00	2025-05-07 18:27:24.526052+00	deleted
8	63811266	https://www.youtube.com/watch?v=stqU2g4BNL4	500	2025-05-07 18:23:18.112+00	2025-05-07 18:27:24.526052+00	deleted
9	63811256	https://www.youtube.com/watch?v=EcGlbxtRrSs	3200	2025-05-07 18:23:18.11+00	2025-05-07 18:27:24.526052+00	deleted
10	63811258	https://www.youtube.com/watch?v=stqU2g4BNL4	700	2025-05-07 18:23:18.117+00	2025-05-07 18:27:24.526052+00	deleted
6	63811066	https://www.youtube.com/watch?v=y802n0O4x_4	10000	2025-05-07 17:56:22.446+00	2025-05-07 18:27:24.526052+00	deleted
7	63811171	https://www.youtube.com/watch?v=FPDgemMZWzY	5000	2025-05-07 18:09:28.974+00	2025-05-07 18:27:24.526052+00	deleted
151	Shhaa	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	1000	2025-05-09 11:39:57.615+00	2025-05-09 11:39:57.615+00	active
13	63811752	https://www.youtube.com/watch?v=kmBnCr3Yd-o	60000	2025-05-08 04:17:17.999+00	2025-05-08 04:17:17.999+00	active
155	63829826	https://www.youtube.com/watch?v=dnCL9by2mc4	10000	2025-05-09 12:18:09.002+00	2025-05-09 12:18:09.002+00	active
16	63812486	https://www.youtube.com/watch?v=TS1BShujgOo	10000	2025-05-08 04:17:18.028+00	2025-05-08 04:17:18.028+00	active
145	63828804	https://www.youtube.com/watch?v=vpy11yVtMpQ	140	2025-05-09 10:01:15.615+00	2025-05-09 11:20:48.110411+00	active
159	63830167	https://www.youtube.com/watch?v=cTNIy33GZ60	1000	2025-05-09 13:02:50.141+00	2025-05-09 13:02:50.141+00	active
110	63822745	https://www.youtube.com/watch?v=ydinrQuEMAU	7500	2025-05-09 04:18:11.733+00	2025-05-09 04:18:11.733+00	active
116	63822944	https://www.youtube.com/watch?v=6mtvyafkl-c	3000	2025-05-09 04:18:11.814+00	2025-05-09 04:18:11.814+00	active
138	63827481	https://www.youtube.com/watch?v=FXQBhAkLKcU	1200	2025-05-09 09:18:01.902+00	2025-05-09 09:18:01.902+00	active
50	63818457	https://www.youtube.com/watch?v=7BZT0nyPvbo	10000	2025-05-08 10:42:42.188+00	2025-05-08 10:42:42.188+00	active
54	ryfyhgvjvjn	https://www.youtube.com/watch?v=c49p32BfEEM	100	2025-05-08 12:42:23.249+00	2025-05-08 12:42:23.249+00	active
55	wdwsfs	https://www.youtube.com/watch?v=c49p32BfEEM	100	2025-05-08 12:52:12.671+00	2025-05-08 12:52:12.671+00	active
57	jfjy	https://www.youtube.com/watch?v=pJkLbSwgWsU	100	2025-05-08 13:21:04.907+00	2025-05-08 13:21:04.907+00	active
59	63819781	https://www.youtube.com/watch?v=pWqZMlfwpNU	2000	2025-05-08 13:36:50.362+00	2025-05-08 13:36:50.362+00	active
61	63820129	https://www.youtube.com/watch?v=HZiobtE2x9s	1900	2025-05-08 15:36:51.183+00	2025-05-08 15:36:51.183+00	active
47	wwws	https://www.youtube.com/watch?v=TS1BShujgOo	100	2025-05-08 10:06:16.718+00	2025-05-08 10:11:10.563802+00	active
126	63827020	https://www.youtube.com/watch?v=tjVFiz6Tbf4	6000	2025-05-09 05:57:01.442+00	2025-05-09 05:57:01.442+00	active
34	63817413	https://www.youtube.com/watch?v=wS_g7HqWI_Q	8000	2025-05-08 08:24:55.215+00	2025-05-08 08:52:50.759983+00	active
83	63821179	https://www.youtube.com/watch?v=4WQ5YKhZga8	3800	2025-05-08 16:37:22.138+00	2025-05-08 16:37:22.138+00	active
85	63821193	https://www.youtube.com/watch?v=2xKjovsx7SY	6600	2025-05-08 16:37:22.148+00	2025-05-08 16:37:22.148+00	active
87	63821189	https://www.youtube.com/watch?v=M3DfdeGWzno	6100	2025-05-08 16:37:22.222+00	2025-05-08 16:37:22.222+00	active
999999	test-fix-trigger	https://example.com	1000	2025-05-08 08:51:47.841765+00	2025-05-08 08:54:04.607699+00	paused
89	63821203	https://www.youtube.com/watch?v=cYvhuHnruzE	6000	2025-05-08 16:40:49.238+00	2025-05-08 16:40:49.238+00	active
91	63821211	https://www.youtube.com/watch?v=GfiBI2gDqbA	6400	2025-05-08 16:40:49.313+00	2025-05-08 16:40:49.313+00	active
45			1000	2025-05-08 08:52:00.657+00	2025-05-08 08:54:33.647296+00	paused
31	63817375	https://www.youtube.com/watch?v=2-GFLWI7JgQ	2000	2025-05-08 08:20:12.657+00	2025-05-08 08:54:35.960601+00	paused
30	63817066	https://www.youtube.com/watch?v=cVFfSJpnAXg	5000	2025-05-08 07:40:15.169+00	2025-05-08 08:56:51.582002+00	paused
33	63817398	https://www.youtube.com/watch?v=JpO62R_sqjw	11000	2025-05-08 08:20:12.7+00	2025-05-08 08:57:17.019551+00	paused
46	63817818	https://www.youtube.com/watch?v=FPDgemMZWzY	5000	2025-05-08 09:15:18.564+00	2025-05-08 09:15:18.564+00	active
148	Dhshs	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	100	2025-05-09 11:01:44.485+00	2025-05-09 11:20:48.110411+00	active
71	63821048	https://www.youtube.com/watch?v=e6zpORkua-g	5000	2025-05-08 16:22:22.008+00	2025-05-08 16:22:22.008+00	active
142	sas	https://portal.withorb.com/	100	2025-05-09 09:49:13.763+00	2025-05-09 11:20:48.110411+00	active
130	rfdrede	https://portal.withorb.com/	1600	2025-05-09 06:10:39.783+00	2025-05-09 11:20:48.110411+00	active
77	63821144	https://www.youtube.com/watch?v=1SUjhmxZ8o4	9810	2025-05-08 16:32:22.27+00	2025-05-08 16:32:22.27+00	active
79	63821154	https://www.youtube.com/watch?v=dDhuXhNwEi8	6500	2025-05-08 16:37:22.017+00	2025-05-08 16:37:22.017+00	active
81	63821171	https://www.youtube.com/watch?v=FuuKJk91kNs	6200	2025-05-08 16:37:22.04+00	2025-05-08 16:37:22.04+00	active
128	63827085	https://www.youtube.com/watch?v=GgUewlir9hQ	550	2025-05-09 06:06:30.944+00	2025-05-09 11:20:48.110411+00	active
133	jhyjt	https://portal.withorb.com/	1000	2025-05-09 06:41:58.379+00	2025-05-09 11:20:48.110411+00	active
104	63821981	https://www.youtube.com/watch?v=FUpzui0Fc4Y	5000	2025-05-08 18:25:09.875+00	2025-05-08 18:25:09.875+00	active
135	Hshshsh	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	100	2025-05-09 06:46:41.697+00	2025-05-09 11:20:48.110411+00	active
140	63827528	https://www.youtube.com/watch?v=j4EtSwLNPVo	3878	2025-05-09 09:18:01.908+00	2025-05-09 09:18:01.908+00	active
122	63826650	https://www.youtube.com/watch?v=TiYgvQDskXc	122	2025-05-09 05:03:50.544+00	2025-05-09 11:20:48.110411+00	active
143	63828766	https://www.youtube.com/watch?v=8EaYsPdOCzE	500	2025-05-09 09:51:15.687+00	2025-05-09 11:20:48.110411+00	active
109	sa	https://www.youtube.com/watch?v=Gfcnrruuxo0	100	2025-05-08 18:47:40.092+00	2025-05-09 11:20:48.110411+00	active
119	63823411	https://www.youtube.com/watch?v=jAWvHwVw6pM	200	2025-05-09 04:18:11.845+00	2025-05-09 09:55:07.4655+00	active
121	63823394	https://www.youtube.com/watch?v=_IGhldbQ0U8	300	2025-05-09 04:18:11.853+00	2025-05-09 11:20:48.110411+00	active
123	63826887	https://www.youtube.com/watch?v=5zUDyjvn9Bs	1000	2025-05-09 05:37:37.343+00	2025-05-09 09:55:07.4655+00	active
20	63815579	https://www.youtube.com/watch?v=LLipm4EfPhE	5000	2025-05-08 04:20:59.408+00	2025-05-09 11:20:48.110411+00	active
21	63815803	https://www.youtube.com/watch?v=oulBLD_CmnY	10000	2025-05-08 04:50:28.217+00	2025-05-09 11:20:48.110411+00	active
22	63815966	https://www.youtube.com/watch?v=op1XBM69HZY	30	2025-05-08 05:12:22.27+00	2025-05-09 11:20:48.110411+00	active
53	2wqwq	https://www.youtube.com/watch?v=c49p32BfEEM	100	2025-05-08 12:39:00.049+00	2025-05-08 12:39:00.049+00	direct_rejected
56	sfs	https://www.youtube.com/watch?v=c49p32BfEEM	100	2025-05-08 13:12:09.824+00	2025-05-08 13:12:09.824+00	active
58	63819799	https://www.youtube.com/watch?v=eqqE1QvQRpg	2000	2025-05-08 13:36:50.35+00	2025-05-08 13:36:50.35+00	active
60	63819972	https://www.youtube.com/watch?v=K0sH7vETXeU	1100	2025-05-08 14:01:50.121+00	2025-05-08 14:01:50.121+00	active
35	63817511	https://www.youtube.com/watch?v=tNx-YeEYFE4	1000	2025-05-08 08:36:44.372+00	2025-05-09 11:20:48.110411+00	active
36	63817512	https://www.youtube.com/watch?v=BaCQqVIpMAU	1000	2025-05-08 08:36:44.375+00	2025-05-09 11:20:48.110411+00	active
44	63817556	https://www.youtube.com/watch?v=PSo-Npr-Vu8	1000	2025-05-08 08:41:44.054+00	2025-05-09 11:20:48.110411+00	active
41	63817522	https://www.youtube.com/watch?v=jDq-gvwrptQ	1000	2025-05-08 08:36:44.497+00	2025-05-09 11:20:48.110411+00	active
70	63821067	https://www.youtube.com/watch?v=gygQoHEB6SI	1900	2025-05-08 16:22:22.005+00	2025-05-08 16:22:22.005+00	active
42	63817547	https://www.youtube.com/watch?v=TOAllkhdHi4	1000	2025-05-08 08:41:43.957+00	2025-05-09 11:20:48.110411+00	active
39	63817526	https://www.youtube.com/watch?v=0u7HpXFpfOU	1000	2025-05-08 08:36:44.483+00	2025-05-09 11:20:48.110411+00	active
76	63821145	https://www.youtube.com/watch?v=hgb6okYl19w	9610	2025-05-08 16:32:22.269+00	2025-05-08 16:32:22.269+00	active
38	63817525	https://www.youtube.com/watch?v=ggb-QuNTHxQ	1000	2025-05-08 08:36:44.475+00	2025-05-09 11:20:48.110411+00	active
80	63821155	https://www.youtube.com/watch?v=rAjMNDLpL28	1650	2025-05-08 16:37:22.023+00	2025-05-08 16:37:22.023+00	active
82	63821163	https://www.youtube.com/watch?v=J16RClCXbxo	8200	2025-05-08 16:37:22.064+00	2025-05-08 16:37:22.064+00	active
84	63821191	https://www.youtube.com/watch?v=eHn4E7SiVDw	7200	2025-05-08 16:37:22.141+00	2025-05-08 16:37:22.141+00	active
86	63821180	https://www.youtube.com/watch?v=ufYFGvBI3io	5900	2025-05-08 16:37:22.197+00	2025-05-08 16:37:22.197+00	active
88	63821202	https://www.youtube.com/watch?v=VGJRd0lzvp0	6000	2025-05-08 16:40:49.236+00	2025-05-08 16:40:49.236+00	active
90	63821201	https://www.youtube.com/watch?v=tow5PEXPiJc	6400	2025-05-08 16:40:49.242+00	2025-05-08 16:40:49.242+00	active
92	63821249	https://www.youtube.com/watch?v=Rn80U-sqPv0	1090	2025-05-08 16:45:48.228+00	2025-05-08 16:45:48.228+00	active
94	63821416	https://www.youtube.com/watch?v=3LMxr45mUtA	2000	2025-05-08 17:05:25.221+00	2025-05-08 17:05:25.221+00	active
40	63817524	https://www.youtube.com/watch?v=jsaKhHi48oE	1000	2025-05-08 08:36:44.494+00	2025-05-09 11:20:48.110411+00	active
43	63817546	https://www.youtube.com/watch?v=WoE6d-bWOq8	1000	2025-05-08 08:41:43.97+00	2025-05-09 11:20:48.110411+00	active
106	grdf	https://portal.withorb.com/	100	2025-05-08 18:35:06.136+00	2025-05-09 11:20:48.110411+00	active
48	63818264	https://www.youtube.com/watch?v=IvFwdh1wZ-Q	11000	2025-05-08 10:14:48.636+00	2025-05-08 10:14:48.636+00	active
51	63818749	https://www.youtube.com/watch?v=4Chkc7NwpHo	5000	2025-05-08 11:18:58.33+00	2025-05-08 11:18:58.33+00	active
146	63828976	https://www.youtube.com/watch?v=YTf-awXiSUs	1199	2025-05-09 10:20:19.044+00	2025-05-09 10:20:19.044+00	active
152	Hshsh	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	100	2025-05-09 11:50:07.766+00	2025-05-09 11:50:07.766+00	active
156	63829965	https://www.youtube.com/watch?v=PyzwgvLNojQ	200	2025-05-09 12:32:51.009+00	2025-05-09 12:32:51.009+00	active
160	63830259	https://www.youtube.com/watch?v=KwLVcmqTYVg	411	2025-05-09 13:12:50.097+00	2025-05-09 13:12:50.097+00	active
108	63822149	https://www.youtube.com/watch?v=pAYHNuq-G0U	5000	2025-05-08 18:44:17.54+00	2025-05-08 18:44:17.54+00	active
105	63822041	https://www.youtube.com/watch?v=ZdQLJ89dbAU	3600	2025-05-08 18:29:23.625+00	2025-05-08 18:29:23.625+00	active
111	63822946	https://www.youtube.com/watch?v=AriVQzZqa4E	3000	2025-05-09 04:18:11.751+00	2025-05-09 04:18:11.751+00	active
149	Huii	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	1000	2025-05-09 11:03:52.366+00	2025-05-09 11:20:48.110411+00	active
15	63812494	https://www.youtube.com/watch?v=RzbJymJSrO8	9000	2025-05-08 04:17:18.024+00	2025-05-09 11:20:48.110411+00	active
17	63813076	https://www.youtube.com/watch?v=xhA-lfYmSnM	110	2025-05-08 04:17:18.109+00	2025-05-09 11:20:48.110411+00	active
18	63814549	https://www.youtube.com/watch?v=0Jk175TH3EE	2000	2025-05-08 04:17:18.112+00	2025-05-09 11:20:48.110411+00	active
19	63815028	https://www.youtube.com/watch?v=B0rKqznqCtY	100	2025-05-08 04:17:18.12+00	2025-05-09 11:20:48.110411+00	active
63	63820184	https://www.youtube.com/watch?v=-4SsNgYY00I	500	2025-05-08 15:36:51.246+00	2025-05-09 11:20:48.110411+00	active
65	efdrgvdv	https://portal.withorb.com/	10000	2025-05-08 15:48:14.166+00	2025-05-09 11:20:48.110411+00	active
67	rgdrgd	https://portal.withorb.com/	10000	2025-05-08 16:08:54.845+00	2025-05-09 11:20:48.110411+00	active
144	63828758	https://www.youtube.com/watch?v=8EaYsPdOCzE	1111	2025-05-09 09:51:15.88+00	2025-05-09 09:51:15.88+00	active
153	Uuii	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	100	2025-05-09 11:55:50.555+00	2025-05-09 11:55:50.555+00	active
157	63829940	https://www.youtube.com/watch?v=OTC_KGJ_kxQ	12000	2025-05-09 12:32:51.013+00	2025-05-09 12:32:51.013+00	active
118	63823402	https://www.youtube.com/watch?v=PF1-mq14TC8	400	2025-05-09 04:18:11.843+00	2025-05-09 09:55:07.4655+00	active
114	63824065	https://www.youtube.com/watch?v=JiESNlJwEzs	124	2025-05-09 04:18:11.806+00	2025-05-09 09:55:07.4655+00	active
124	63826940	https://www.youtube.com/watch?v=DGNAfBnjRXs	11000	2025-05-09 05:44:12.548+00	2025-05-09 05:44:12.548+00	active
150	Hjiii	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	100	2025-05-09 11:10:21.417+00	2025-05-09 11:20:48.110411+00	active
147	63828968	https://www.youtube.com/watch?v=rxtjef7W2-4	500	2025-05-09 10:20:19.047+00	2025-05-09 11:20:48.110411+00	active
141	Hshsbs	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	100	2025-05-09 09:24:31.502+00	2025-05-09 11:20:48.110411+00	active
12	63811435	https://www.youtube.com/watch?v=qiLpTt7RZxs	350	2025-05-07 18:48:50.532+00	2025-05-09 11:20:48.110411+00	active
93	63821326	https://www.youtube.com/watch?v=kvVW1XLcCMA	1000	2025-05-08 16:55:48.308+00	2025-05-09 11:20:48.110411+00	active
95	63821386	https://www.youtube.com/watch?v=o_LwMOM2jOM	1000	2025-05-08 17:05:25.225+00	2025-05-09 11:20:48.110411+00	active
97	adsf	https://portal.withorb.com/	10000	2025-05-08 17:18:53.225+00	2025-05-09 11:20:48.110411+00	active
99	grrthyt	https://portal.withorb.com/	10000	2025-05-08 17:21:57.101+00	2025-05-09 11:20:48.110411+00	active
73	gtrtrgt	https://portal.withorb.com/	5000	2025-05-08 16:24:33.892+00	2025-05-09 11:20:48.110411+00	active
75	erfefr	https://portal.withorb.com/	1000	2025-05-08 16:25:05.199+00	2025-05-09 11:20:48.110411+00	active
101	qswad	https://portal.withorb.com/	1000	2025-05-08 17:29:59.565+00	2025-05-09 11:20:48.110411+00	active
102	cdsvfdvd	https://portal.withorb.com/	10000	2025-05-08 17:59:36.874+00	2025-05-09 11:20:48.110411+00	active
112	63822947	https://www.youtube.com/watch?v=XLlz4hjHPdg	10000	2025-05-09 04:18:11.754+00	2025-05-09 04:18:11.754+00	active
115	63822945	https://www.youtube.com/watch?v=qDTB9rqG6Zw	10000	2025-05-09 04:18:11.809+00	2025-05-09 04:18:11.809+00	active
62	63820508	https://www.youtube.com/watch?v=VCR9OKBzcos	30	2025-05-08 15:36:51.231+00	2025-05-09 11:20:48.110411+00	active
64	fsfvsfs	https://portal.withorb.com/	1000	2025-05-08 15:47:26.142+00	2025-05-09 11:20:48.110411+00	active
129	63827107	https://www.youtube.com/watch?v=Yh_oTzpwhDs	3000	2025-05-09 06:06:30.946+00	2025-05-09 06:06:30.946+00	active
131	63827168	https://www.youtube.com/watch?v=5asrwZ4o9j0	13000	2025-05-09 06:16:30.683+00	2025-05-09 06:16:30.683+00	active
134	63827383	https://www.youtube.com/watch?v=gNNJhJQtsMM	1495	2025-05-09 06:44:32.951+00	2025-05-09 06:44:32.951+00	active
136	63827429	https://www.youtube.com/watch?v=kzw7UEG5_Hg	2000	2025-05-09 06:49:43.892+00	2025-05-09 06:49:43.892+00	active
154	63829740	https://www.youtube.com/watch?v=6mtvyafkl-c	700	2025-05-09 12:03:09.071+00	2025-05-09 12:03:09.071+00	active
158	63830063	https://www.youtube.com/watch?v=e6zpORkua-g	2500	2025-05-09 12:47:50.232+00	2025-05-09 12:47:50.232+00	active
120	63823410	https://www.youtube.com/watch?v=Av5j-QLO7co	500	2025-05-09 04:18:11.847+00	2025-05-09 09:55:07.4655+00	active
125	daedawd	https://portal.withorb.com/	4000	2025-05-09 05:55:34.023+00	2025-05-09 11:20:48.110411+00	active
25	63816006	https://www.youtube.com/watch?v=op1XBM69HZY	1000	2025-05-08 05:17:22.244+00	2025-05-09 11:20:48.110411+00	active
37	63817521	https://www.youtube.com/watch?v=Ej_KqAol2ag	1000	2025-05-08 08:36:44.393+00	2025-05-09 11:20:48.110411+00	active
11	eferf	https://portal.withorb.com/	100	2025-05-07 18:27:45.867+00	2025-05-09 11:20:48.110411+00	active
69	regvdd	https://portal.withorb.com/	10000	2025-05-08 16:15:50.412+00	2025-05-09 11:20:48.110411+00	active
66	fedsgd	https://portal.withorb.com/	10000	2025-05-08 15:53:30.161+00	2025-05-09 11:20:48.110411+00	active
68	eddfdd	https://portal.withorb.com/	1000	2025-05-08 16:09:48.969+00	2025-05-09 11:20:48.110411+00	active
74	rtgfgtr	https://portal.withorb.com/	10000	2025-05-08 16:24:48.765+00	2025-05-09 11:20:48.110411+00	active
72	Test Click Count Fixedqdq	https://portal.withorb.com/	10000	2025-05-08 16:24:10.115+00	2025-05-09 11:20:48.110411+00	active
78	fxdfgfd	https://portal.withorb.com/	10000	2025-05-08 16:34:15.13+00	2025-05-09 11:20:48.110411+00	active
96	asasa	https://portal.withorb.com/	10000	2025-05-08 17:14:00.51+00	2025-05-09 11:20:48.110411+00	active
98	efsdfs	https://portal.withorb.com/	10000	2025-05-08 17:21:38.933+00	2025-05-09 11:20:48.110411+00	active
132	qwdwd	https://portal.withorb.com/	100	2025-05-09 06:22:49.08+00	2025-05-09 11:20:48.110411+00	active
14	63811629	https://www.youtube.com/watch?v=DqJU_r8_QNk	10000	2025-05-08 04:17:18.002+00	2025-05-09 11:20:48.110411+00	active
113	63823511	https://www.youtube.com/watch?v=PyzwgvLNojQ	100	2025-05-09 04:18:11.795+00	2025-05-09 11:20:48.110411+00	active
117	63822955	https://www.youtube.com/watch?v=enycSwZAFaY	1000	2025-05-09 04:18:11.837+00	2025-05-09 11:20:48.110411+00	active
100	fwesfs	https://portal.withorb.com/	10000	2025-05-08 17:27:21.131+00	2025-05-09 11:20:48.110411+00	active
103	rfref	https://portal.withorb.com/	10000	2025-05-08 18:08:10.052+00	2025-05-09 11:20:48.110411+00	active
127	rfeswrfewrf	https://portal.withorb.com/	4000	2025-05-09 05:58:11.852+00	2025-05-09 11:20:48.110411+00	active
137	63827550	https://www.youtube.com/watch?v=YNzmfWFWXds	1000	2025-05-09 09:18:01.9+00	2025-05-09 11:20:48.110411+00	active
139	63828509	https://www.youtube.com/watch?v=ymLi_dodpiQ	30	2025-05-09 09:18:01.908+00	2025-05-09 11:20:48.110411+00	active
\.


--
-- Data for Name: protection_settings; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.protection_settings (key, value) FROM stdin;
click_protection_enabled	t
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.sessions (sid, sess, expire) FROM stdin;
\.


--
-- Data for Name: sync_operations; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.sync_operations (id, is_auto_sync, started_at, completed_at) FROM stdin;
1	t	2025-04-27 14:07:12.873583+00	2025-04-27 14:07:12.968722+00
2	t	2025-04-27 14:34:44.976034+00	2025-04-27 14:34:45.019653+00
3	t	2025-04-27 14:36:23.354513+00	2025-04-27 14:36:23.391689+00
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.system_settings (id, name, value, description, created_at, updated_at) FROM stdin;
1	api_secret_key	uiic487487	\N	2025-05-07 17:51:20.151+00	2025-05-08 06:04:01.147+00
2	access_code	b	Special access URL code for secure login	2025-05-08 08:32:55.296+00	2025-05-08 08:59:01.776+00
3	minimum_clicks_threshold	1000	The minimum number of remaining clicks that triggers campaign pause	2025-05-09 04:52:43.635398+00	2025-05-09 05:00:01.262+00
4	remaining_clicks_threshold	3000	The minimum number of remaining clicks required for campaign auto-reactivation	2025-05-09 04:52:43.635398+00	2025-05-09 05:00:01.279+00
\.


--
-- Data for Name: trafficstar_campaigns; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.trafficstar_campaigns (id, trafficstar_id, name, status, active, is_archived, max_daily, pricing_model, schedule_end_time, campaign_data, created_at, updated_at, last_requested_action, last_requested_action_at, last_requested_action_success, last_verified_status, sync_status, last_budget_update, last_budget_update_value, last_end_time_update, last_end_time_update_value, daily_spent, daily_spent_updated_at) FROM stdin;
\.


--
-- Data for Name: trafficstar_credentials; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.trafficstar_credentials (id, api_key, access_token, token_expiry, created_at, updated_at) FROM stdin;
1	eyJhbGciOiJIUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJjOGJmY2YyZi1lZjJlLTQwZGYtYTg4ZC1kYjQ3NmI4MTFiOGMifQ.eyJpYXQiOjE3NDA5MTI1MTUsImp0aSI6ImNjNWQ2MWVkLTg5NjEtNDA4YS1iYmRhLTNhOTdkYWYwYWM4NCIsImlzcyI6Imh0dHBzOi8vaWQudHJhZmZpY3N0YXJzLmNvbS9yZWFsbXMvdHJhZmZpY3N0YXJzIiwiYXVkIjoiaHR0cHM6Ly9pZC50cmFmZmljc3RhcnMuY29tL3JlYWxtcy90cmFmZmljc3RhcnMiLCJzdWIiOiJmN2RlZTQyMy0zYzY3LTQxYjItODE4My1lZTdmZjBmMTUwOGIiLCJ0eXAiOiJPZmZsaW5lIiwiYXpwIjoiY29yZS1hcGkiLCJzZXNzaW9uX3N0YXRlIjoiYTgyNTM5MmYtZjQ1OS00Yjg5LTkzNmEtZDcyNDcwODVlMDczIiwic2NvcGUiOiJvcGVuaWQgZW1haWwgb2ZmbGluZV9hY2Nlc3MgcHJvZmlsZSIsInNpZCI6ImE4MjUzOTJmLWY0NTktNGI4OS05MzZhLWQ3MjQ3MDg1ZTA3MyJ9.Zw6cuWlQCZcbqHX3jF1VIl6rpyWjN58zW8_s9al0Yl8	eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJ6Y2YyOTMwb0RpSmJxUWs4VzR0amJBMjdWbHpxLWpvdGJnS0J4eDJYaDFNIn0.eyJleHAiOjE3NDY0Mjg2OTIsImlhdCI6MTc0NjM0MjI5MiwianRpIjoiYTExMmJlZjAtMWViMy00YTlkLWE0YzMtNzkzMTU5NzNlNWFhIiwiaXNzIjoiaHR0cHM6Ly9pZC50cmFmZmljc3RhcnMuY29tL3JlYWxtcy90cmFmZmljc3RhcnMiLCJzdWIiOiJmN2RlZTQyMy0zYzY3LTQxYjItODE4My1lZTdmZjBmMTUwOGIiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJjb3JlLWFwaSIsInNlc3Npb25fc3RhdGUiOiJhODI1MzkyZi1mNDU5LTRiODktOTM2YS1kNzI0NzA4NWUwNzMiLCJhY3IiOiIxIiwic2NvcGUiOiJvcGVuaWQgZW1haWwgb2ZmbGluZV9hY2Nlc3MgcHJvZmlsZSIsInNpZCI6ImE4MjUzOTJmLWY0NTktNGI4OS05MzZhLWQ3MjQ3MDg1ZTA3MyIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJuYW1lIjoiUmlqd2EgTWlyemEiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJyaWp3YW1pcnphQGdtYWlsLmNvbSIsImdpdmVuX25hbWUiOiJSaWp3YSIsImZhbWlseV9uYW1lIjoiTWlyemEiLCJlbWFpbCI6InJpandhbWlyemFAZ21haWwuY29tIn0.OsVu9Lk3EruyDCCalSj9NG3BAApPm325XKkTDrv4ud1f__6aMIHgoPfVUX6u62kfwuJFELD61NMbCmVG6Nir_BZ3ZOBXfjA5wyVcJgNL7tpmmjE4kp7o-N031p4wRsbehNXwt34LHIjBvIOata2VL94116w8Wi-eYtygZkRA0YW66dyolscXNHHj6k7Wtjv6BTwNylUQ3vU7yvt-IFBvC2GiGn1LYN3kVDAMWZ6CicA3OIFFeOiywSuvd9HSps19er5qnfrQij-cQKC8lWyFMv6adYpnbe7KM1O5iBfNCseCR13faL1u-CthmAYzpvkfgBqu2ncyRMfMpaT6gM2rvQ	2025-05-05 07:03:52.664	2025-04-24 15:34:27.232973	2025-05-04 07:04:52.683
\.


--
-- Data for Name: url_click_logs; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.url_click_logs (id, url_id, log_entry, created_at, click_time, indian_time, date_key, hour_key) FROM stdin;
\.


--
-- Data for Name: url_click_records; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.url_click_records (id, url_id, ip_address, user_agent, referer, click_time) FROM stdin;
\.


--
-- Data for Name: urls; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.urls (id, campaign_id, name, target_url, click_limit, clicks, status, created_at, updated_at, original_click_limit, pending_budget_update, budget_calculated) FROM stdin;
49	2	63818457	https://www.youtube.com/watch?v=7BZT0nyPvbo	10000	0	active	2025-05-08 10:42:42.168	2025-05-08 10:42:42.168	10000	f	f
13	1	63811752	https://www.youtube.com/watch?v=kmBnCr3Yd-o	270000	0	deleted	2025-05-08 04:17:17.978	2025-05-08 05:17:55.425	60000	f	f
16	1	63812486	https://www.youtube.com/watch?v=TS1BShujgOo	45000	0	deleted	2025-05-08 04:17:18.001	2025-05-08 05:17:55.47	10000	f	f
106	2	63822149	https://www.youtube.com/watch?v=pAYHNuq-G0U	5000	0	active	2025-05-08 18:44:17.521	2025-05-08 18:44:17.521	5000	f	f
51	2	63818849	https://www.youtube.com/watch?v=2PrEKI6hx3M	2500	0	active	2025-05-08 11:34:54.067	2025-05-08 11:34:54.067	2500	f	f
2	1	Test Click Count Fix	https://portal.withorb.com/	450	4	deleted	2025-05-07 17:20:14.078	2025-05-07 18:10:24.075	100	f	f
118	1	63823410	https://www.youtube.com/watch?v=Av5j-QLO7co	2250	0	deleted	2025-05-09 04:18:11.827	2025-05-09 10:01:13.877	500	f	f
150	1	Hshsh	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	450	0	active	2025-05-09 11:50:07.785	2025-05-09 11:53:08.863	100	f	t
153	2	63829826	https://www.youtube.com/watch?v=dnCL9by2mc4	10000	0	active	2025-05-09 12:18:08.981	2025-05-09 12:18:08.981	10000	f	f
34	2	63817413	https://www.youtube.com/watch?v=wS_g7HqWI_Q	8000	0	active	2025-05-08 08:24:55.19	2025-05-08 08:52:50.77	8000	f	f
24	2	63815996	https://www.youtube.com/watch?v=op1XBM69HZY	10000	0	active	2025-05-08 05:17:22.223	2025-05-08 05:57:06.58	10000	f	f
26	2	63815997	https://www.youtube.com/watch?v=op1XBM69HZY	30000	0	active	2025-05-08 05:17:22.225	2025-05-08 05:57:06.58	30000	f	f
23	2	63815967	https://www.youtube.com/watch?v=op1XBM69HZY	1001	1	active	2025-05-08 05:12:22.318	2025-05-08 05:57:06.58	1001	f	f
27	2	63816221	https://www.youtube.com/watch?v=3LMxr45mUtA	8000	0	active	2025-05-08 05:47:10.183	2025-05-08 05:57:06.58	8000	f	f
3	1	63810936	https://www.youtube.com/watch?v=cnzz6GG7920	2250	0	deleted	2025-05-07 17:39:20.307	2025-05-07 18:27:24.535	500	f	f
4	1	63810944	https://www.youtube.com/watch?v=DaObRvPgvlk	2250	0	deleted	2025-05-07 17:39:20.312	2025-05-07 18:27:24.535	500	f	f
5	1	63810935	https://www.youtube.com/watch?v=EdHwe8eaRxw	2250	0	deleted	2025-05-07 17:39:20.314	2025-05-07 18:27:24.535	500	f	f
8	1	63811266	https://www.youtube.com/watch?v=stqU2g4BNL4	2250	0	deleted	2025-05-07 18:23:18.084	2025-05-07 18:27:24.535	500	f	f
9	1	63811258	https://www.youtube.com/watch?v=stqU2g4BNL4	3150	0	deleted	2025-05-07 18:23:18.098	2025-05-07 18:27:24.535	700	f	f
10	1	63811256	https://www.youtube.com/watch?v=EcGlbxtRrSs	14400	0	deleted	2025-05-07 18:23:18.075	2025-05-07 18:27:24.535	3200	f	f
6	1	63811066	https://www.youtube.com/watch?v=y802n0O4x_4	45000	0	deleted	2025-05-07 17:56:22.428	2025-05-07 18:27:24.535	10000	f	f
7	1	63811171	https://www.youtube.com/watch?v=FPDgemMZWzY	22500	0	deleted	2025-05-07 18:09:28.904	2025-05-07 18:27:24.535	5000	f	f
28	2	63816376	https://www.youtube.com/watch?v=42Wd3lJRX00	8000	0	active	2025-05-08 06:07:58.604	2025-05-08 06:07:58.604	8000	f	f
158	1	63830259	https://www.youtube.com/watch?v=KwLVcmqTYVg	1850	0	active	2025-05-09 13:12:50.078	2025-05-09 13:12:50.767	411	f	t
143	1	63828804	https://www.youtube.com/watch?v=vpy11yVtMpQ	630	0	active	2025-05-09 10:01:15.597	2025-05-09 11:20:48.126	140	f	f
146	1	Dhshs	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	450	0	active	2025-05-09 11:01:44.51	2025-05-09 11:20:48.126	100	f	f
53	1	wdwsfs	https://www.youtube.com/watch?v=c49p32BfEEM	450	0	deleted	2025-05-08 12:52:12.695	2025-05-08 12:52:42.72	100	f	f
111	1	63823511	https://www.youtube.com/watch?v=PyzwgvLNojQ	450	0	active	2025-05-09 04:18:11.772	2025-05-09 11:20:48.126	100	f	f
57	2	63819781	https://www.youtube.com/watch?v=pWqZMlfwpNU	2000	0	active	2025-05-08 13:36:50.343	2025-05-08 13:36:50.343	2000	f	f
55	1	jfjy	https://www.youtube.com/watch?v=pJkLbSwgWsU	450	0	deleted	2025-05-08 13:21:04.926	2025-05-08 13:55:52.17	100	f	f
59	2	63820129	https://www.youtube.com/watch?v=HZiobtE2x9s	1900	0	active	2025-05-08 15:36:51.16	2025-05-08 15:36:51.16	1900	f	f
32	2	63817390	https://www.youtube.com/watch?v=7PomINCeWJM	5000	0	active	2025-05-08 08:20:12.637	2025-05-08 08:20:12.637	5000	f	f
116	1	63822955	https://www.youtube.com/watch?v=enycSwZAFaY	4500	0	active	2025-05-09 04:18:11.812	2025-05-09 11:20:48.126	1000	f	f
11	1	eferf	https://portal.withorb.com/	450	0	active	2025-05-07 18:27:45.886	2025-05-09 11:20:48.126	100	f	f
96	1	efsdfs	https://portal.withorb.com/	45000	0	active	2025-05-08 17:21:38.953	2025-05-09 11:20:48.126	10000	f	t
98	1	fwesfs	https://portal.withorb.com/	45000	0	active	2025-05-08 17:27:21.152	2025-05-09 11:20:48.126	10000	f	t
79	2	63821171	https://www.youtube.com/watch?v=FuuKJk91kNs	6200	0	active	2025-05-08 16:37:22.022	2025-05-08 16:37:22.022	6200	f	f
70	1	Test Click Count Fixedqdq	https://portal.withorb.com/	45000	0	active	2025-05-08 16:24:10.133	2025-05-09 11:20:48.126	10000	f	t
31	2	63817375	https://www.youtube.com/watch?v=2-GFLWI7JgQ	2000	0	paused	2025-05-08 08:20:12.64	2025-05-08 08:54:35.97948	2000	f	f
30	2	63817066	https://www.youtube.com/watch?v=cVFfSJpnAXg	5000	0	paused	2025-05-08 07:40:15.145	2025-05-08 08:56:51.606181	5000	f	f
33	2	63817398	https://www.youtube.com/watch?v=JpO62R_sqjw	11000	0	paused	2025-05-08 08:20:12.684	2025-05-08 08:57:17.03	11000	f	f
45	2	63817818	https://www.youtube.com/watch?v=FPDgemMZWzY	5000	0	active	2025-05-08 09:15:18.546	2025-05-08 09:15:18.546	5000	f	f
81	2	63821179	https://www.youtube.com/watch?v=4WQ5YKhZga8	3800	0	active	2025-05-08 16:37:22.118	2025-05-08 16:37:22.118	3800	f	f
69	2	63821048	https://www.youtube.com/watch?v=e6zpORkua-g	5000	0	active	2025-05-08 16:22:21.99	2025-05-08 16:22:21.99	5000	f	f
83	2	63821193	https://www.youtube.com/watch?v=2xKjovsx7SY	6600	0	active	2025-05-08 16:37:22.131	2025-05-08 16:37:22.131	6600	f	f
75	2	63821144	https://www.youtube.com/watch?v=1SUjhmxZ8o4	9810	0	active	2025-05-08 16:32:22.251	2025-05-08 16:32:22.251	9810	f	f
77	2	63821155	https://www.youtube.com/watch?v=rAjMNDLpL28	1650	0	active	2025-05-08 16:37:22.005	2025-05-08 16:37:22.005	1650	f	f
85	2	63821189	https://www.youtube.com/watch?v=M3DfdeGWzno	6100	0	active	2025-05-08 16:37:22.202	2025-05-08 16:37:22.202	6100	f	f
87	2	63821202	https://www.youtube.com/watch?v=VGJRd0lzvp0	6000	0	active	2025-05-08 16:40:49.217	2025-05-08 16:40:49.217	6000	f	f
89	2	63821211	https://www.youtube.com/watch?v=GfiBI2gDqbA	6400	0	active	2025-05-08 16:40:49.292	2025-05-08 16:40:49.292	6400	f	f
102	2	63821981	https://www.youtube.com/watch?v=FUpzui0Fc4Y	5000	0	active	2025-05-08 18:25:09.856	2025-05-08 18:25:09.856	5000	f	f
108	2	63822946	https://www.youtube.com/watch?v=AriVQzZqa4E	3000	0	active	2025-05-09 04:18:11.725	2025-05-09 04:18:11.725	3000	f	f
113	2	63822945	https://www.youtube.com/watch?v=qDTB9rqG6Zw	10000	0	active	2025-05-09 04:18:11.791	2025-05-09 04:18:11.791	10000	f	f
117	1	63823411	https://www.youtube.com/watch?v=jAWvHwVw6pM	900	0	deleted	2025-05-09 04:18:11.824	2025-05-09 10:01:13.878	200	f	f
129	2	63827168	https://www.youtube.com/watch?v=5asrwZ4o9j0	13000	0	active	2025-05-09 06:16:30.664	2025-05-09 06:16:30.664	13000	f	f
142	2	63828758	https://www.youtube.com/watch?v=8EaYsPdOCzE	1111	0	active	2025-05-09 09:51:15.861	2025-05-09 09:51:15.861	1111	f	f
144	1	63828968	https://www.youtube.com/watch?v=rxtjef7W2-4	2250	0	active	2025-05-09 10:20:19.026	2025-05-09 11:20:48.126	500	f	t
147	1	Huii	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	4500	0	active	2025-05-09 11:03:52.386	2025-05-09 11:20:48.126	1000	f	t
140	1	sas	https://portal.withorb.com/	450	0	active	2025-05-09 09:49:13.789	2025-05-09 11:20:48.126	100	f	f
134	2	63827429	https://www.youtube.com/watch?v=kzw7UEG5_Hg	2000	0	active	2025-05-09 06:49:43.875	2025-05-09 06:49:43.875	2000	f	f
138	2	63827528	https://www.youtube.com/watch?v=j4EtSwLNPVo	3878	0	active	2025-05-09 09:18:01.884	2025-05-09 09:18:01.884	3878	f	f
139	1	Hshsbs	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	450	13	active	2025-05-09 09:24:31.522	2025-05-09 11:20:48.126	100	t	f
120	1	63826650	https://www.youtube.com/watch?v=TiYgvQDskXc	549	0	active	2025-05-09 05:03:50.525	2025-05-09 11:20:48.126	122	f	f
47	2	63818264	https://www.youtube.com/watch?v=IvFwdh1wZ-Q	11000	0	active	2025-05-08 10:14:48.616	2025-05-08 10:14:48.616	11000	f	f
46	1	wwws	https://www.youtube.com/watch?v=TS1BShujgOo	450	0	deleted	2025-05-08 10:06:16.739	2025-05-08 10:22:43.497	100	f	f
52	1	ryfyhgvjvjn	https://www.youtube.com/watch?v=c49p32BfEEM	450	0	deleted	2025-05-08 12:42:23.272	2025-05-08 12:46:00.395	100	f	f
54	1	sfs	https://www.youtube.com/watch?v=c49p32BfEEM	450	0	deleted	2025-05-08 13:12:09.844	2025-05-08 13:25:50.339	100	f	f
56	2	63819799	https://www.youtube.com/watch?v=eqqE1QvQRpg	2000	0	active	2025-05-08 13:36:50.333	2025-05-08 13:36:50.333	2000	f	f
58	2	63819972	https://www.youtube.com/watch?v=K0sH7vETXeU	1100	0	active	2025-05-08 14:01:50.103	2025-05-08 14:01:50.103	1100	f	f
151	1	Uuii	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	450	0	active	2025-05-09 11:55:50.572	2025-05-09 12:08:08.566	100	f	t
154	1	63829965	https://www.youtube.com/watch?v=PyzwgvLNojQ	900	0	active	2025-05-09 12:32:50.988	2025-05-09 12:42:49.578	200	f	t
107	1	sa	https://www.youtube.com/watch?v=Gfcnrruuxo0	450	0	active	2025-05-08 18:47:40.112	2025-05-09 11:20:48.126	100	f	f
126	1	63827085	https://www.youtube.com/watch?v=GgUewlir9hQ	2475	0	active	2025-05-09 06:06:30.919	2025-05-09 11:20:48.126	550	f	f
48	2	63818364	https://www.youtube.com/watch?v=D6qR_AAmmUo	12000	0	active	2025-05-08 10:28:58.444	2025-05-08 10:28:58.444	12000	f	f
29	1	63816575	https://www.youtube.com/watch?v=_MlzedR1VW8	4500	0	deleted	2025-05-08 06:53:20.812	2025-05-08 16:06:50.147	1000	f	f
86	2	63821203	https://www.youtube.com/watch?v=cYvhuHnruzE	6000	0	active	2025-05-08 16:40:49.22	2025-05-08 16:40:49.22	6000	f	f
88	2	63821201	https://www.youtube.com/watch?v=tow5PEXPiJc	6400	0	active	2025-05-08 16:40:49.222	2025-05-08 16:40:49.222	6400	f	f
68	2	63821067	https://www.youtube.com/watch?v=gygQoHEB6SI	1900	0	active	2025-05-08 16:22:21.988	2025-05-08 16:22:21.988	1900	f	f
90	2	63821249	https://www.youtube.com/watch?v=Rn80U-sqPv0	1090	0	active	2025-05-08 16:45:48.209	2025-05-08 16:45:48.209	1090	f	f
92	2	63821416	https://www.youtube.com/watch?v=3LMxr45mUtA	2000	0	active	2025-05-08 17:05:25.202	2025-05-08 17:05:25.202	2000	f	f
50	2	63818749	https://www.youtube.com/watch?v=4Chkc7NwpHo	5000	0	active	2025-05-08 11:18:58.309	2025-05-08 11:18:58.309	5000	f	f
103	2	63822041	https://www.youtube.com/watch?v=ZdQLJ89dbAU	3600	0	active	2025-05-08 18:29:23.606	2025-05-08 18:29:23.606	3600	f	f
131	1	jhyjt	https://portal.withorb.com/	4500	0	active	2025-05-09 06:41:58.396	2025-05-09 11:20:48.126	1000	f	f
35	1	63817511	https://www.youtube.com/watch?v=tNx-YeEYFE4	4500	0	active	2025-05-08 08:36:44.335	2025-05-09 11:20:48.126	1000	f	f
36	1	63817512	https://www.youtube.com/watch?v=BaCQqVIpMAU	4500	0	active	2025-05-08 08:36:44.336	2025-05-09 11:20:48.126	1000	f	f
63	1	efdrgvdv	https://portal.withorb.com/	45000	0	active	2025-05-08 15:48:14.185	2025-05-09 11:20:48.126	10000	f	t
74	2	63821145	https://www.youtube.com/watch?v=hgb6okYl19w	9610	0	active	2025-05-08 16:32:22.249	2025-05-08 16:32:22.249	9610	f	f
78	2	63821154	https://www.youtube.com/watch?v=dDhuXhNwEi8	6500	0	active	2025-05-08 16:37:21.995	2025-05-08 16:37:21.995	6500	f	f
80	2	63821163	https://www.youtube.com/watch?v=J16RClCXbxo	8200	0	active	2025-05-08 16:37:22.048	2025-05-08 16:37:22.048	8200	f	f
82	2	63821191	https://www.youtube.com/watch?v=eHn4E7SiVDw	7200	0	active	2025-05-08 16:37:22.123	2025-05-08 16:37:22.123	7200	f	f
84	2	63821180	https://www.youtube.com/watch?v=ufYFGvBI3io	5900	0	active	2025-05-08 16:37:22.176	2025-05-08 16:37:22.176	5900	f	f
152	1	63829740	https://www.youtube.com/watch?v=6mtvyafkl-c	3150	0	deleted	2025-05-09 12:03:09.052	2025-05-09 12:31:26.011	700	f	t
145	2	63828976	https://www.youtube.com/watch?v=YTf-awXiSUs	1199	0	active	2025-05-09 10:20:19.023	2025-05-09 10:20:19.023	1199	f	f
155	2	63829940	https://www.youtube.com/watch?v=OTC_KGJ_kxQ	12000	0	active	2025-05-09 12:32:50.99	2025-05-09 12:32:50.99	12000	f	f
127	2	63827107	https://www.youtube.com/watch?v=Yh_oTzpwhDs	3000	0	active	2025-05-09 06:06:30.926	2025-05-09 06:06:30.926	3000	f	f
110	2	63822947	https://www.youtube.com/watch?v=XLlz4hjHPdg	10000	0	active	2025-05-09 04:18:11.73	2025-05-09 04:18:11.73	10000	f	f
148	1	Hjiii	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	450	0	active	2025-05-09 11:10:21.445	2025-05-09 11:20:48.126	100	f	t
41	1	63817522	https://www.youtube.com/watch?v=jDq-gvwrptQ	4500	0	active	2025-05-08 08:36:44.478	2025-05-09 11:20:48.126	1000	f	f
119	1	63823394	https://www.youtube.com/watch?v=_IGhldbQ0U8	1350	0	active	2025-05-09 04:18:11.83	2025-05-09 11:20:48.126	300	f	f
25	1	63816006	https://www.youtube.com/watch?v=op1XBM69HZY	4500	0	active	2025-05-08 05:17:22.224	2025-05-09 11:20:48.126	1000	f	f
42	1	63817547	https://www.youtube.com/watch?v=TOAllkhdHi4	4500	0	active	2025-05-08 08:41:43.939	2025-05-09 11:20:48.126	1000	f	f
12	1	63811435	https://www.youtube.com/watch?v=qiLpTt7RZxs	1575	0	active	2025-05-07 18:48:50.51	2025-05-09 11:20:48.126	350	f	f
14	1	63811629	https://www.youtube.com/watch?v=DqJU_r8_QNk	45000	0	active	2025-05-08 04:17:17.983	2025-05-09 11:20:48.126	10000	f	f
15	1	63812494	https://www.youtube.com/watch?v=RzbJymJSrO8	40500	0	active	2025-05-08 04:17:18.005	2025-05-09 11:20:48.126	9000	f	f
122	2	63826940	https://www.youtube.com/watch?v=DGNAfBnjRXs	11000	0	active	2025-05-09 05:44:12.531	2025-05-09 05:44:12.531	11000	f	f
17	1	63813076	https://www.youtube.com/watch?v=xhA-lfYmSnM	495	0	active	2025-05-08 04:17:18.091	2025-05-09 11:20:48.126	110	f	f
18	1	63814549	https://www.youtube.com/watch?v=0Jk175TH3EE	9000	0	active	2025-05-08 04:17:18.093	2025-05-09 11:20:48.126	2000	f	f
114	2	63822944	https://www.youtube.com/watch?v=6mtvyafkl-c	3000	0	active	2025-05-09 04:18:11.793	2025-05-09 04:18:11.793	3000	f	f
124	2	63827020	https://www.youtube.com/watch?v=tjVFiz6Tbf4	6000	0	active	2025-05-09 05:57:01.424	2025-05-09 05:57:01.424	6000	f	f
61	1	63820508	https://www.youtube.com/watch?v=VCR9OKBzcos	135	0	active	2025-05-08 15:36:51.214	2025-05-09 11:20:48.126	30	f	f
132	2	63827383	https://www.youtube.com/watch?v=gNNJhJQtsMM	1495	0	active	2025-05-09 06:44:32.935	2025-05-09 06:44:32.935	1495	f	f
71	1	gtrtrgt	https://portal.withorb.com/	22500	0	active	2025-05-08 16:24:33.915	2025-05-09 11:20:48.126	5000	f	t
65	1	rgdrgd	https://portal.withorb.com/	45000	0	active	2025-05-08 16:08:54.947	2025-05-09 11:20:48.126	10000	f	t
130	1	qwdwd	https://portal.withorb.com/	450	0	active	2025-05-09 06:22:49.102	2025-05-09 11:20:48.126	100	f	f
100	1	cdsvfdvd	https://portal.withorb.com/	45000	0	active	2025-05-08 17:59:36.9	2025-05-09 11:20:48.126	10000	f	t
19	1	63815028	https://www.youtube.com/watch?v=B0rKqznqCtY	450	0	active	2025-05-08 04:17:18.098	2025-05-09 11:20:48.126	100	f	f
20	1	63815579	https://www.youtube.com/watch?v=LLipm4EfPhE	22500	0	active	2025-05-08 04:20:59.388	2025-05-09 11:20:48.126	5000	f	f
156	2	63830063	https://www.youtube.com/watch?v=e6zpORkua-g	2500	0	active	2025-05-09 12:47:50.214	2025-05-09 12:47:50.214	2500	f	f
105	2	63822113	https://www.youtube.com/watch?v=PtIlp8jtSCg	1200	0	active	2025-05-08 18:39:23.632	2025-05-08 18:39:23.632	1200	f	f
136	2	63827481	https://www.youtube.com/watch?v=FXQBhAkLKcU	1200	0	active	2025-05-09 09:18:01.876	2025-05-09 09:18:01.876	1200	f	f
109	2	63822745	https://www.youtube.com/watch?v=ydinrQuEMAU	7500	0	active	2025-05-09 04:18:11.701	2025-05-09 04:18:11.701	7500	f	f
21	1	63815803	https://www.youtube.com/watch?v=oulBLD_CmnY	45000	0	active	2025-05-08 04:50:28.2	2025-05-09 11:20:48.126	10000	f	f
22	1	63815966	https://www.youtube.com/watch?v=op1XBM69HZY	135	0	active	2025-05-08 05:12:22.249	2025-05-09 11:20:48.126	30	f	f
72	1	rtgfgtr	https://portal.withorb.com/	45000	0	active	2025-05-08 16:24:48.784	2025-05-09 11:20:48.126	10000	f	t
40	1	63817526	https://www.youtube.com/watch?v=0u7HpXFpfOU	4500	0	active	2025-05-08 08:36:44.462	2025-05-09 11:20:48.126	1000	f	f
38	1	63817525	https://www.youtube.com/watch?v=ggb-QuNTHxQ	4500	0	active	2025-05-08 08:36:44.456	2025-05-09 11:20:48.126	1000	f	f
39	1	63817524	https://www.youtube.com/watch?v=jsaKhHi48oE	4500	0	active	2025-05-08 08:36:44.477	2025-05-09 11:20:48.126	1000	f	f
43	1	63817546	https://www.youtube.com/watch?v=WoE6d-bWOq8	4500	0	active	2025-05-08 08:41:43.952	2025-05-09 11:20:48.126	1000	f	f
37	1	63817521	https://www.youtube.com/watch?v=Ej_KqAol2ag	4500	0	active	2025-05-08 08:36:44.374	2025-05-09 11:20:48.126	1000	f	f
44	1	63817556	https://www.youtube.com/watch?v=PSo-Npr-Vu8	4500	0	active	2025-05-08 08:41:44.031	2025-05-09 11:20:48.126	1000	f	f
60	1	63820184	https://www.youtube.com/watch?v=-4SsNgYY00I	2250	0	active	2025-05-08 15:36:51.227	2025-05-09 11:20:48.126	500	f	f
76	1	fxdfgfd	https://portal.withorb.com/	45000	0	active	2025-05-08 16:34:15.147	2025-05-09 11:20:48.126	10000	f	t
62	1	fsfvsfs	https://portal.withorb.com/	4500	0	active	2025-05-08 15:47:26.162	2025-05-09 11:20:48.126	1000	f	t
64	1	fedsgd	https://portal.withorb.com/	45000	0	active	2025-05-08 15:53:30.181	2025-05-09 11:20:48.126	10000	f	t
66	1	eddfdd	https://portal.withorb.com/	4500	0	active	2025-05-08 16:09:48.987	2025-05-09 11:20:48.126	1000	f	t
94	1	asasa	https://portal.withorb.com/	45000	0	active	2025-05-08 17:14:00.529	2025-05-09 11:20:48.126	10000	f	f
121	1	63826887	https://www.youtube.com/watch?v=5zUDyjvn9Bs	4500	0	deleted	2025-05-09 05:37:37.322	2025-05-09 10:01:13.877	1000	f	f
112	1	63824065	https://www.youtube.com/watch?v=JiESNlJwEzs	558	0	deleted	2025-05-09 04:18:11.778	2025-05-09 10:01:13.876	124	f	f
115	1	63823402	https://www.youtube.com/watch?v=PF1-mq14TC8	1800	0	deleted	2025-05-09 04:18:11.815	2025-05-09 10:01:13.927	400	f	f
157	1	63830167	https://www.youtube.com/watch?v=cTNIy33GZ60	4500	0	active	2025-05-09 13:02:50.123	2025-05-09 13:12:50.837	1000	f	t
137	1	63828509	https://www.youtube.com/watch?v=ymLi_dodpiQ	135	0	active	2025-05-09 09:18:01.886	2025-05-09 11:20:48.126	30	f	f
135	1	63827550	https://www.youtube.com/watch?v=YNzmfWFWXds	4500	0	active	2025-05-09 09:18:01.874	2025-05-09 11:20:48.126	1000	f	f
67	1	regvdd	https://portal.withorb.com/	45000	0	active	2025-05-08 16:15:50.432	2025-05-09 11:20:48.126	10000	f	t
73	1	erfefr	https://portal.withorb.com/	4500	0	active	2025-05-08 16:25:05.217	2025-05-09 11:20:48.126	1000	f	t
91	1	63821326	https://www.youtube.com/watch?v=kvVW1XLcCMA	4500	0	active	2025-05-08 16:55:48.291	2025-05-09 11:20:48.126	1000	f	f
93	1	63821386	https://www.youtube.com/watch?v=o_LwMOM2jOM	4500	0	active	2025-05-08 17:05:25.203	2025-05-09 11:20:48.126	1000	f	f
95	1	adsf	https://portal.withorb.com/	45000	0	active	2025-05-08 17:18:53.247	2025-05-09 11:20:48.126	10000	f	f
97	1	grrthyt	https://portal.withorb.com/	45000	0	active	2025-05-08 17:21:57.121	2025-05-09 11:20:48.126	10000	f	t
99	1	qswad	https://portal.withorb.com/	4500	0	active	2025-05-08 17:29:59.586	2025-05-09 11:20:48.126	1000	f	t
101	1	rfref	https://portal.withorb.com/	45000	0	active	2025-05-08 18:08:10.073	2025-05-09 11:20:48.126	10000	f	t
104	1	grdf	https://portal.withorb.com/	450	0	active	2025-05-08 18:35:06.157	2025-05-09 11:20:48.126	100	f	f
123	1	daedawd	https://portal.withorb.com/	18000	0	active	2025-05-09 05:55:34.044	2025-05-09 11:20:48.126	4000	f	f
128	1	rfdrede	https://portal.withorb.com/	7200	0	active	2025-05-09 06:10:39.806	2025-05-09 11:20:48.126	1600	f	f
125	1	rfeswrfewrf	https://portal.withorb.com/	18000	0	active	2025-05-09 05:58:11.872	2025-05-09 11:20:48.126	4000	f	f
133	1	Hshshsh	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	450	0	active	2025-05-09 06:46:41.72	2025-05-09 11:20:48.126	100	f	f
141	1	63828766	https://www.youtube.com/watch?v=8EaYsPdOCzE	2250	0	active	2025-05-09 09:51:15.672	2025-05-09 11:20:48.126	500	f	f
149	1	Shhaa	https://viralplayer.xyz/cl2kl9k.php?key=jeihcbh3wio5tsxtc3t	4500	0	active	2025-05-09 11:39:57.634	2025-05-09 11:53:08.942	1000	f	t
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, username, role, last_login, created_at, updated_at, password_hash, password_salt) FROM stdin;
2	rijwamirza	admin	2025-04-25 21:06:53.585	2025-04-25 20:46:48.917	2025-04-25 20:50:29.000295	ce7e06e6b1d3e252cc69b7531bb36bbc79a5c7e38c0e67e3e1e5dd2bae66877b80909452ba010fc94ac74c5d86bf3bdb6abde7d68c48b2cec5a8b22b4e8bc2bf	5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8
\.


--
-- Data for Name: youtube_api_logs; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.youtube_api_logs (id, log_type, message, campaign_id, details, is_error, "timestamp") FROM stdin;
1	TEST	Testing YouTube API logs functionality	1	{"test": true, "source": "manual_insert"}	f	2025-05-08 12:10:59.607526
2	TEST_FIX	Testing fixed YouTube API logs functionality	2	{"test": true, "source": "manual_fix_test"}	f	2025-05-08 12:13:49.303363
3	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:15:59.726
4	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 59, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:15:59.749
5	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:16:53.425
6	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 60, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:16:53.448
7	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:17:53.424
8	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 61, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:17:53.453
9	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:18:53.412
10	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 62, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:18:53.434
11	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:19:13.085
12	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 62, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:19:13.11
13	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:20:13.081
14	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 63, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:20:13.102
15	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:21:13.084
16	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 64, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:21:13.11
17	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:22:13.1
18	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 65, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:22:13.125
19	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:22:52.529
20	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 66, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:22:52.553
21	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:23:52.468
22	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 67, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:23:52.521
23	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:24:52.52
24	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 68, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:24:52.546
25	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:25:52.523
26	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 69, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:25:52.547
27	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:26:52.532
28	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 70, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:26:52.559
29	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:27:52.518
30	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 71, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:27:52.543
31	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:28:52.462
32	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 72, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:28:52.486
33	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:29:52.514
400	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:55.933
34	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 73, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:29:52.535
35	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:30:52.463
36	interval_check	Campaign 1: Last check: 2025-05-08T11:16:30.424Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T11:16:30.424Z", "shouldProcess": true, "elapsedMinutes": 74, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:30:52.482
37	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:31:52.521
38	interval_check	Campaign 1: Last check: 2025-05-08T12:30:52.704Z, Interval: 15 minutes, Time remaining: 15 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T12:30:52.704Z", "shouldProcess": false, "elapsedMinutes": 0, "intervalMinutes": 15, "minutesRemaining": 15}	f	2025-05-08 12:31:52.538
39	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:32:52.53
40	interval_check	Campaign 1: Last check: 2025-05-08T12:30:52.704Z, Interval: 15 minutes, Time remaining: 14 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T12:30:52.704Z", "shouldProcess": false, "elapsedMinutes": 1, "intervalMinutes": 15, "minutesRemaining": 14}	f	2025-05-08 12:32:52.55
41	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:33:52.545
42	interval_check	Campaign 1: Last check: 2025-05-08T12:30:52.704Z, Interval: 15 minutes, Time remaining: 13 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T12:30:52.704Z", "shouldProcess": false, "elapsedMinutes": 2, "intervalMinutes": 15, "minutesRemaining": 13}	f	2025-05-08 12:33:52.571
43	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:34:45.265
44	interval_check	Campaign 1: Last check: 2025-05-08T12:30:52.704Z, Interval: 15 minutes, Time remaining: 12 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T12:30:52.704Z", "shouldProcess": false, "elapsedMinutes": 3, "intervalMinutes": 15, "minutesRemaining": 12}	f	2025-05-08 12:34:45.285
45	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 12:46:00.123
46	interval_check	Campaign 1: Last check: 2025-05-08T12:30:52.704Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T12:30:52.704Z", "shouldProcess": true, "elapsedMinutes": 15, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 12:46:00.142
53	force_check	Manual force check triggered at 2025-05-08T13:02:11.533Z for campaign 1	1	{"trigger": "manual", "timestamp": "2025-05-08T13:02:11.533Z", "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"}	f	2025-05-08 13:02:11.533
54	api_request	API Request at 2025-05-08T13:02:11.618Z - 21 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 16 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "_MlzedR1VW8", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8"], "quotaCost": 1, "timestamp": "2025-05-08T13:02:11.618Z", "requestType": "videos.list"}	f	2025-05-08 13:02:11.618
55	api_response	API Response at 2025-05-08T13:02:11.770Z - Received 21/21 videos in 128ms	1	{"timestamp": "2025-05-08T13:02:11.770Z", "quotaUsage": 1, "responseTime": 128, "videosReceived": 21, "videoIdsRequested": 21}	f	2025-05-08 13:02:11.77
59	force_check	Manual force check triggered at 2025-05-08T13:10:31.497Z for campaign 1	1	{"trigger": "manual", "timestamp": "2025-05-08T13:10:31.497Z", "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"}	f	2025-05-08 13:10:31.497
60	api_request	API Request at 2025-05-08T13:10:31.552Z - 21 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 16 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "_MlzedR1VW8", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8"], "quotaCost": 1, "timestamp": "2025-05-08T13:10:31.552Z", "requestType": "videos.list"}	f	2025-05-08 13:10:31.552
61	api_response	API Response at 2025-05-08T13:10:31.695Z - Received 21/21 videos in 126ms	1	{"timestamp": "2025-05-08T13:10:31.695Z", "quotaUsage": 1, "responseTime": 126, "videosReceived": 21, "videoIdsRequested": 21}	f	2025-05-08 13:10:31.695
62	force_check	Manual force check triggered at 2025-05-08T13:10:37.281Z for campaign 1	1	{"trigger": "manual", "timestamp": "2025-05-08T13:10:37.281Z", "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"}	f	2025-05-08 13:10:37.281
63	api_request	API Request at 2025-05-08T13:10:37.386Z - 21 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 16 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "_MlzedR1VW8", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8"], "quotaCost": 1, "timestamp": "2025-05-08T13:10:37.386Z", "requestType": "videos.list"}	f	2025-05-08 13:10:37.387
64	api_response	API Response at 2025-05-08T13:10:37.599Z - Received 21/21 videos in 194ms	1	{"timestamp": "2025-05-08T13:10:37.599Z", "quotaUsage": 1, "responseTime": 194, "videosReceived": 21, "videoIdsRequested": 21}	f	2025-05-08 13:10:37.599
65	force_check	Manual force check triggered at 2025-05-08T13:10:38.434Z for campaign 1	1	{"trigger": "manual", "timestamp": "2025-05-08T13:10:38.434Z", "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"}	f	2025-05-08 13:10:38.434
155	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-08T17:36:54.365Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T17:36:54.365Z", "nextCheckMinutes": 30}	f	2025-05-08 17:06:58.438
475	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:41:13.938
66	api_request	API Request at 2025-05-08T13:10:38.486Z - 21 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 16 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "_MlzedR1VW8", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8"], "quotaCost": 1, "timestamp": "2025-05-08T13:10:38.486Z", "requestType": "videos.list"}	f	2025-05-08 13:10:38.486
67	api_response	API Response at 2025-05-08T13:10:38.590Z - Received 21/21 videos in 82ms	1	{"timestamp": "2025-05-08T13:10:38.590Z", "quotaUsage": 1, "responseTime": 82, "videosReceived": 21, "videoIdsRequested": 21}	f	2025-05-08 13:10:38.59
68	force_check	Manual force check triggered at 2025-05-08T13:10:38.664Z for campaign 1	1	{"trigger": "manual", "timestamp": "2025-05-08T13:10:38.664Z", "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"}	f	2025-05-08 13:10:38.664
69	api_request	API Request at 2025-05-08T13:10:38.717Z - 21 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 16 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "_MlzedR1VW8", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8"], "quotaCost": 1, "timestamp": "2025-05-08T13:10:38.717Z", "requestType": "videos.list"}	f	2025-05-08 13:10:38.717
70	api_response	API Response at 2025-05-08T13:10:38.892Z - Received 21/21 videos in 157ms	1	{"timestamp": "2025-05-08T13:10:38.892Z", "quotaUsage": 1, "responseTime": 157, "videosReceived": 21, "videoIdsRequested": 21}	f	2025-05-08 13:10:38.892
71	force_check	Manual force check triggered at 2025-05-08T13:10:48.373Z for campaign 1	1	{"trigger": "manual", "timestamp": "2025-05-08T13:10:48.373Z", "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"}	f	2025-05-08 13:10:48.373
72	api_request	API Request at 2025-05-08T13:10:48.433Z - 21 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 16 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "_MlzedR1VW8", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8"], "quotaCost": 1, "timestamp": "2025-05-08T13:10:48.433Z", "requestType": "videos.list"}	f	2025-05-08 13:10:48.433
73	api_response	API Response at 2025-05-08T13:10:48.551Z - Received 21/21 videos in 95ms	1	{"timestamp": "2025-05-08T13:10:48.551Z", "quotaUsage": 1, "responseTime": 95, "videosReceived": 21, "videoIdsRequested": 21}	f	2025-05-08 13:10:48.551
74	api_request	API Request at 2025-05-08T13:12:09.731Z - 1 videos: c49p32BfEEM	1	{"videoIds": ["c49p32BfEEM"], "quotaCost": 1, "timestamp": "2025-05-08T13:12:09.731Z", "requestType": "videos.list"}	f	2025-05-08 13:12:09.731
75	api_response	API Response at 2025-05-08T13:12:09.789Z - Received 1/1 videos in 40ms	1	{"timestamp": "2025-05-08T13:12:09.789Z", "quotaUsage": 1, "responseTime": 40, "videosReceived": 1, "videoIdsRequested": 1}	f	2025-05-08 13:12:09.789
79	api_request	API Request at 2025-05-08T13:21:04.801Z - 1 videos: pJkLbSwgWsU	1	{"videoIds": ["pJkLbSwgWsU"], "quotaCost": 1, "timestamp": "2025-05-08T13:21:04.801Z", "requestType": "videos.list"}	f	2025-05-08 13:21:04.801
80	api_response	API Response at 2025-05-08T13:21:04.871Z - Received 1/1 videos in 50ms	1	{"timestamp": "2025-05-08T13:21:04.871Z", "quotaUsage": 1, "responseTime": 50, "videosReceived": 1, "videoIdsRequested": 1}	f	2025-05-08 13:21:04.871
84	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 13:25:50.043
85	interval_check	Campaign 1: Last check: 2025-05-08T13:10:48.575Z, Interval: 15 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T13:10:48.575Z", "shouldProcess": true, "elapsedMinutes": 15, "intervalMinutes": 15, "minutesRemaining": 0}	f	2025-05-08 13:25:50.059
86	api_request	API Request at 2025-05-08T13:25:50.105Z - 23 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 18 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "pJkLbSwgWsU", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "_MlzedR1VW8", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "c49p32BfEEM"], "quotaCost": 1, "timestamp": "2025-05-08T13:25:50.105Z", "requestType": "videos.list"}	f	2025-05-08 13:25:50.105
87	api_response	API Response at 2025-05-08T13:25:50.302Z - Received 23/23 videos in 183ms	1	{"timestamp": "2025-05-08T13:25:50.302Z", "quotaUsage": 1, "responseTime": 183, "videosReceived": 23, "videoIdsRequested": 23}	f	2025-05-08 13:25:50.302
97	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 13:55:51.905
98	interval_check	Campaign 1: Last check: 2025-05-08T13:25:50.355Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T13:25:50.355Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 13:55:51.923
99	api_request	API Request at 2025-05-08T13:55:51.978Z - 22 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 17 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "pJkLbSwgWsU", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "_MlzedR1VW8", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8"], "quotaCost": 1, "timestamp": "2025-05-08T13:55:51.978Z", "requestType": "videos.list"}	f	2025-05-08 13:55:51.978
100	api_response	API Response at 2025-05-08T13:55:52.124Z - Received 21/22 videos in 128ms	1	{"timestamp": "2025-05-08T13:55:52.124Z", "quotaUsage": 1, "responseTime": 128, "videosReceived": 21, "videoIdsRequested": 22}	f	2025-05-08 13:55:52.124
110	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 15:36:48.404
111	interval_check	Campaign 1: Last check: 2025-05-08T13:55:52.191Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T13:55:52.191Z", "shouldProcess": true, "elapsedMinutes": 100, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 15:36:48.434
112	api_request	API Request at 2025-05-08T15:36:48.503Z - 21 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 16 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "_MlzedR1VW8", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8"], "quotaCost": 1, "timestamp": "2025-05-08T15:36:48.503Z", "requestType": "videos.list"}	f	2025-05-08 15:36:48.503
113	api_response	API Response at 2025-05-08T15:36:48.673Z - Received 21/21 videos in 148ms	1	{"timestamp": "2025-05-08T15:36:48.673Z", "quotaUsage": 1, "responseTime": 148, "videosReceived": 21, "videoIdsRequested": 21}	f	2025-05-08 15:36:48.673
120	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 16:06:49.844
121	interval_check	Campaign 1: Last check: 2025-05-08T15:36:48.694Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T15:36:48.694Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 16:06:49.864
122	api_request	API Request at 2025-05-08T16:06:49.937Z - 23 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 18 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "_MlzedR1VW8", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I"], "quotaCost": 1, "timestamp": "2025-05-08T16:06:49.937Z", "requestType": "videos.list"}	f	2025-05-08 16:06:49.937
123	api_response	API Response at 2025-05-08T16:06:50.077Z - Received 23/23 videos in 120ms	1	{"timestamp": "2025-05-08T16:06:50.077Z", "quotaUsage": 1, "responseTime": 120, "videosReceived": 23, "videoIdsRequested": 23}	f	2025-05-08 16:06:50.077
133	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 16:36:51.605
134	interval_check	Campaign 1: Last check: 2025-05-08T16:06:50.168Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T16:06:50.168Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 16:36:51.623
135	api_request	API Request at 2025-05-08T16:36:51.676Z - 22 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 17 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I"], "quotaCost": 1, "timestamp": "2025-05-08T16:36:51.676Z", "requestType": "videos.list"}	f	2025-05-08 16:36:51.676
136	api_response	API Response at 2025-05-08T16:36:51.907Z - Received 22/22 videos in 214ms	1	{"timestamp": "2025-05-08T16:36:51.907Z", "quotaUsage": 1, "responseTime": 214, "videosReceived": 22, "videoIdsRequested": 22}	f	2025-05-08 16:36:51.907
140	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 16:40:45.785
141	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T16:36:51.924Z", "elapsedMinutes": 3, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 27}]}	f	2025-05-08 16:40:45.803
142	scheduler_check	Next check scheduled for campaign 1 in 27 minutes at 2025-05-08T17:06:52.924Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T17:06:52.924Z", "nextCheckMinutes": 27}	f	2025-05-08 16:40:45.82
143	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:00:23.372
144	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T16:36:51.924Z", "elapsedMinutes": 23, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 7}]}	f	2025-05-08 17:00:23.393
145	scheduler_check	Next check scheduled for campaign 1 in 7 minutes at 2025-05-08T17:06:52.924Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T17:06:52.924Z", "nextCheckMinutes": 7}	f	2025-05-08 17:00:23.412
146	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:06:53.065
147	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T16:36:51.924Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 17:06:53.084
148	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 17:06:53.101
149	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 17:06:53.134
150	interval_check	Campaign 1: Last check: 2025-05-08T16:36:51.924Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T16:36:51.924Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 17:06:53.151
151	api_request	API Request at 2025-05-08T17:06:53.203Z - 24 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 19 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "kvVW1XLcCMA", "o_LwMOM2jOM", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I"], "quotaCost": 1, "timestamp": "2025-05-08T17:06:53.203Z", "requestType": "videos.list"}	f	2025-05-08 17:06:53.203
152	api_response	API Response at 2025-05-08T17:06:53.347Z - Received 24/24 videos in 127ms	1	{"timestamp": "2025-05-08T17:06:53.347Z", "quotaUsage": 1, "responseTime": 127, "videosReceived": 24, "videoIdsRequested": 24}	f	2025-05-08 17:06:53.347
153	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:06:58.402
154	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:06:53.365Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-08 17:06:58.422
156	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:35:35.673
157	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:06:53.365Z", "elapsedMinutes": 28, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 2}]}	f	2025-05-08 17:35:35.695
158	scheduler_check	Next check scheduled for campaign 1 in 2 minutes at 2025-05-08T17:36:54.365Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T17:36:54.365Z", "nextCheckMinutes": 2}	f	2025-05-08 17:35:35.715
159	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:36:54.508
160	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:06:53.365Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 17:36:54.526
161	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 17:36:54.544
162	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 17:36:54.578
163	interval_check	Campaign 1: Last check: 2025-05-08T17:06:53.365Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T17:06:53.365Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 17:36:54.596
164	api_request	API Request at 2025-05-08T17:36:54.650Z - 24 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 19 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "kvVW1XLcCMA", "o_LwMOM2jOM", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I"], "quotaCost": 1, "timestamp": "2025-05-08T17:36:54.650Z", "requestType": "videos.list"}	f	2025-05-08 17:36:54.65
165	api_response	API Response at 2025-05-08T17:36:54.798Z - Received 24/24 videos in 131ms	1	{"timestamp": "2025-05-08T17:36:54.798Z", "quotaUsage": 1, "responseTime": 131, "videosReceived": 24, "videoIdsRequested": 24}	f	2025-05-08 17:36:54.798
166	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:36:59.86
167	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-08 17:36:59.881
168	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-08T18:06:55.816Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:06:55.816Z", "nextCheckMinutes": 30}	f	2025-05-08 17:36:59.914
169	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:42:58.194
170	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "elapsedMinutes": 6, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 24}]}	f	2025-05-08 17:42:58.214
171	scheduler_check	Next check scheduled for campaign 1 in 24 minutes at 2025-05-08T18:06:55.816Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:06:55.816Z", "nextCheckMinutes": 24}	f	2025-05-08 17:42:58.232
172	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:49:17.648
173	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "elapsedMinutes": 12, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 18}]}	f	2025-05-08 17:49:17.693
174	scheduler_check	Next check scheduled for campaign 1 in 18 minutes at 2025-05-08T18:06:55.816Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:06:55.816Z", "nextCheckMinutes": 18}	f	2025-05-08 17:49:17.712
175	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:50:24.73
176	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "elapsedMinutes": 13, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 17}]}	f	2025-05-08 17:50:24.751
177	scheduler_check	Next check scheduled for campaign 1 in 17 minutes at 2025-05-08T18:06:55.816Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:06:55.816Z", "nextCheckMinutes": 17}	f	2025-05-08 17:50:24.771
178	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:53:09.802
179	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "elapsedMinutes": 16, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 14}]}	f	2025-05-08 17:53:09.822
180	scheduler_check	Next check scheduled for campaign 1 in 14 minutes at 2025-05-08T18:06:55.816Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:06:55.816Z", "nextCheckMinutes": 14}	f	2025-05-08 17:53:09.84
181	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:54:18.219
182	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "elapsedMinutes": 17, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 13}]}	f	2025-05-08 17:54:18.243
183	scheduler_check	Next check scheduled for campaign 1 in 13 minutes at 2025-05-08T18:06:55.816Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:06:55.816Z", "nextCheckMinutes": 13}	f	2025-05-08 17:54:18.272
184	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:56:04.936
185	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "elapsedMinutes": 19, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 11}]}	f	2025-05-08 17:56:04.956
325	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:38.268
186	scheduler_check	Next check scheduled for campaign 1 in 11 minutes at 2025-05-08T18:06:55.816Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:06:55.816Z", "nextCheckMinutes": 11}	f	2025-05-08 17:56:04.975
187	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 17:56:29.16
188	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "elapsedMinutes": 19, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 11}]}	f	2025-05-08 17:56:29.181
189	scheduler_check	Next check scheduled for campaign 1 in 11 minutes at 2025-05-08T18:06:55.816Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:06:55.816Z", "nextCheckMinutes": 11}	f	2025-05-08 17:56:29.205
190	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:06:01.156
191	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "elapsedMinutes": 29, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 1}]}	f	2025-05-08 18:06:01.176
192	scheduler_check	Next check scheduled for campaign 1 in 1 minutes at 2025-05-08T18:06:55.816Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:06:55.816Z", "nextCheckMinutes": 1}	f	2025-05-08 18:06:01.196
193	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:06:55.896
194	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:06:55.914
195	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:06:55.933
196	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:06:55.967
197	interval_check	Campaign 1: Last check: 2025-05-08T17:36:54.816Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T17:36:54.816Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:06:55.985
198	api_request	API Request at 2025-05-08T18:06:56.041Z - 24 videos: tNx-YeEYFE4, BaCQqVIpMAU, jDq-gvwrptQ, op1XBM69HZY, TOAllkhdHi4... (and 19 more)	1	{"videoIds": ["tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "kvVW1XLcCMA", "o_LwMOM2jOM", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I"], "quotaCost": 1, "timestamp": "2025-05-08T18:06:56.041Z", "requestType": "videos.list"}	f	2025-05-08 18:06:56.041
199	api_response	API Response at 2025-05-08T18:06:56.181Z - Received 24/24 videos in 122ms	1	{"timestamp": "2025-05-08T18:06:56.181Z", "quotaUsage": 1, "responseTime": 122, "videosReceived": 24, "videoIdsRequested": 24}	f	2025-05-08 18:06:56.182
200	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:07:01.243
201	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-08 18:07:01.262
202	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-08T18:36:57.202Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:36:57.202Z", "nextCheckMinutes": 30}	f	2025-05-08 18:07:01.281
203	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:14:12.912
204	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 7, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 23}]}	f	2025-05-08 18:14:12.932
205	scheduler_check	Next check scheduled for campaign 1 in 23 minutes at 2025-05-08T18:36:57.202Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:36:57.202Z", "nextCheckMinutes": 23}	f	2025-05-08 18:14:12.951
206	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:16:02.871
207	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 9, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 21}]}	f	2025-05-08 18:16:02.895
208	scheduler_check	Next check scheduled for campaign 1 in 21 minutes at 2025-05-08T18:36:57.202Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:36:57.202Z", "nextCheckMinutes": 21}	f	2025-05-08 18:16:02.914
209	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:18:08.505
210	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 11, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 19}]}	f	2025-05-08 18:18:08.532
211	scheduler_check	Next check scheduled for campaign 1 in 19 minutes at 2025-05-08T18:36:57.202Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:36:57.202Z", "nextCheckMinutes": 19}	f	2025-05-08 18:18:08.555
212	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:20:08.208
213	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 13, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 17}]}	f	2025-05-08 18:20:08.232
214	scheduler_check	Next check scheduled for campaign 1 in 17 minutes at 2025-05-08T18:36:57.202Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:36:57.202Z", "nextCheckMinutes": 17}	f	2025-05-08 18:20:08.25
215	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:25:48.389
216	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 18, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 12}]}	f	2025-05-08 18:25:48.41
217	scheduler_check	Next check scheduled for campaign 1 in 12 minutes at 2025-05-08T18:36:57.202Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:36:57.202Z", "nextCheckMinutes": 12}	f	2025-05-08 18:25:48.429
218	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:25:58.745
219	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 19, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 11}]}	f	2025-05-08 18:25:58.763
220	scheduler_check	Next check scheduled for campaign 1 in 11 minutes at 2025-05-08T18:36:57.202Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:36:57.202Z", "nextCheckMinutes": 11}	f	2025-05-08 18:25:58.781
221	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:29:03.465
222	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 22, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 8}]}	f	2025-05-08 18:29:03.485
223	scheduler_check	Next check scheduled for campaign 1 in 8 minutes at 2025-05-08T18:36:57.202Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:36:57.202Z", "nextCheckMinutes": 8}	f	2025-05-08 18:29:03.504
224	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:29:20.778
225	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 22, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 8}]}	f	2025-05-08 18:29:20.805
226	scheduler_check	Next check scheduled for campaign 1 in 8 minutes at 2025-05-08T18:36:57.202Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-08T18:36:57.202Z", "nextCheckMinutes": 8}	f	2025-05-08 18:29:20.827
227	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:36:57.356
228	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:36:57.376
229	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:36:57.396
230	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:36:57.435
231	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:36:57.454
232	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:02.533
233	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:04.687
234	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:04.719
235	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:04.759
236	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:04.777
237	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:09.854
238	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:09.874
239	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:09.893
240	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:09.931
241	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:09.951
242	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:15.028
243	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:15.132
244	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:15.152
245	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:15.194
246	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:15.214
247	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:20.292
248	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:20.311
249	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:20.33
250	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:20.368
251	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:20.388
252	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:25.465
253	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:25.485
254	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:25.504
255	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:25.543
256	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:25.563
257	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:30.653
258	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:30.673
259	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:30.693
260	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:30.734
261	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:30.754
262	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:35.834
263	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:35.857
264	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:35.875
265	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:35.913
266	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:35.932
267	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:41.007
268	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:41.027
269	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:41.046
270	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:41.084
271	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:41.103
272	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:46.201
273	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:46.233
274	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:46.262
275	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:46.312
276	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:46.335
277	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:51.425
278	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:51.449
279	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:51.478
280	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:51.53
281	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:51.55
282	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:37:56.633
283	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:37:56.654
284	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:37:56.678
285	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:37:56.729
286	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:37:56.756
287	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:01.865
288	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:01.898
289	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:01.927
290	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:01.975
291	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:01.997
292	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:07.094
293	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:07.122
294	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:07.146
295	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:07.2
296	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:07.226
297	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:12.321
298	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:12.34
299	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:12.361
300	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:12.401
301	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:12.422
302	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:17.511
303	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:17.534
304	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:17.558
305	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:17.604
306	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:17.624
307	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:22.703
308	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:22.725
309	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:22.741
310	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:22.777
311	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:22.793
312	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:27.868
313	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:27.891
314	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:27.907
315	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:27.943
316	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:27.96
317	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:33.031
318	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:33.049
319	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:33.067
320	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:33.101
321	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:33.118
322	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:38.188
323	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:38.211
324	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:38.229
326	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:38.294
327	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:43.368
328	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:43.388
329	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:43.405
330	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:43.44
331	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:43.457
332	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:48.527
333	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:48.545
334	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:48.563
335	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:48.599
336	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:48.615
337	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:53.689
338	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 31, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:53.707
339	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:53.725
340	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:53.76
341	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 31, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:53.778
342	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:38:58.85
343	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:38:58.868
344	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:38:58.886
345	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:38:58.921
346	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:38:58.938
347	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:04.007
348	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:04.024
349	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:04.042
350	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:04.076
351	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:04.094
352	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:09.172
353	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:09.195
354	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:09.214
355	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:09.248
356	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:09.266
357	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:14.336
358	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:14.36
359	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:14.378
360	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:14.413
361	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:14.431
362	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:19.501
363	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:19.525
364	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:19.543
365	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:19.583
366	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:19.603
367	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:24.696
368	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:24.72
369	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:24.74
370	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:24.782
371	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:24.806
372	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:29.892
373	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:29.917
374	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:29.936
375	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:29.971
376	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:29.99
377	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:35.071
378	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:35.092
379	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:35.113
380	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:35.167
381	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:35.212
382	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:40.305
383	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:40.323
384	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:40.342
385	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:40.379
386	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:40.399
387	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:45.473
388	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:45.499
389	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:45.518
390	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:45.555
391	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:45.575
392	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:50.65
393	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:50.67
394	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:50.688
395	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:39:50.727
396	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:50.747
397	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:39:55.825
398	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 32, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:39:55.871
399	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:39:55.892
401	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 32, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:39:55.952
402	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:01.041
403	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:01.065
404	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:01.084
405	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:01.149
406	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:01.188
407	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:06.34
408	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:06.359
409	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:06.379
410	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:06.421
411	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:06.44
412	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:11.524
413	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:11.546
414	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:11.566
415	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:11.626
416	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:11.66
417	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:16.755
418	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:16.778
419	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:16.798
420	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:16.839
421	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:16.86
422	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:21.96
423	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:21.982
424	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:22.002
425	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:22.04
426	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:22.058
427	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:27.159
428	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:27.178
429	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:27.196
430	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:27.234
431	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:27.255
432	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:32.35
433	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:32.37
434	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:32.39
435	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:32.428
436	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:32.448
437	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:37.526
438	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:37.566
439	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:37.586
440	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:37.626
441	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:37.644
442	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:42.721
443	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:42.744
444	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:42.763
445	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:42.8
446	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:42.819
447	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:47.892
448	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:47.946
449	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:47.965
450	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:48.002
451	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:48.021
452	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:53.096
453	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 33, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:53.163
454	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:53.182
455	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:53.22
456	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 33, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:53.242
457	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:40:58.315
458	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 34, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:40:58.341
459	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:40:58.36
460	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:40:58.403
461	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 34, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:40:58.421
462	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:41:03.495
463	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 34, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:41:03.517
464	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:41:03.536
465	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:41:03.574
466	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 34, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:41:03.593
467	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:41:08.669
468	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 34, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:41:08.691
469	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:41:08.71
470	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:41:08.747
471	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 34, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:41:08.768
472	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:41:13.842
473	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 34, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:41:13.868
474	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:41:13.889
476	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 34, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:41:13.959
477	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:41:19.046
478	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 34, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:41:19.07
479	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:41:19.089
480	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:41:19.126
481	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 34, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:41:19.146
482	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:41:24.22
483	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 34, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:41:24.238
484	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:41:24.257
485	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:41:24.292
486	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 34, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:41:24.311
487	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:41:29.383
488	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 34, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:41:29.403
489	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:41:29.421
490	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:41:29.463
491	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 34, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:41:29.484
492	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:41:34.559
493	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 34, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:41:34.578
494	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:41:34.596
495	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:41:34.631
496	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 34, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:41:34.65
497	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-08 18:41:39.724
498	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 34, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-08 18:41:39.743
499	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-08 18:41:39.762
500	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-08 18:41:39.798
501	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 34, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-08 18:41:39.817
502	api_request	API Request at 2025-05-08T18:47:39.988Z - 1 videos: Gfcnrruuxo0	1	{"videoIds": ["Gfcnrruuxo0"], "quotaCost": 1, "timestamp": "2025-05-08T18:47:39.988Z", "requestType": "videos.list"}	f	2025-05-08 18:47:39.988
503	api_response	API Response at 2025-05-08T18:47:40.056Z - Received 1/1 videos in 49ms	1	{"timestamp": "2025-05-08T18:47:40.056Z", "quotaUsage": 1, "responseTime": 49, "videosReceived": 1, "videoIdsRequested": 1}	f	2025-05-08 18:47:40.056
504	scheduler_check	Error scheduling next check	\N	{"error": "column \\"minimum_clicks_threshold\\" does not exist"}	t	2025-05-09 04:46:36.635
505	scheduler_check	Error scheduling next check	\N	{"error": "column \\"minimum_clicks_threshold\\" does not exist"}	t	2025-05-09 04:48:23.406
506	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:01:13.385
507	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "elapsedMinutes": 954, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-09 10:01:13.433
508	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-09 10:01:13.452
509	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-09 10:01:13.488
510	interval_check	Campaign 1: Last check: 2025-05-08T18:06:56.202Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-08T18:06:56.202Z", "shouldProcess": true, "elapsedMinutes": 954, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-09 10:01:13.507
537	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 30}	f	2025-05-09 10:31:24.787
511	api_request	API Request at 2025-05-09T10:01:13.564Z - 38 videos: PyzwgvLNojQ, enycSwZAFaY, Av5j-QLO7co, TiYgvQDskXc, Gfcnrruuxo0... (and 33 more)	1	{"videoIds": ["PyzwgvLNojQ", "enycSwZAFaY", "Av5j-QLO7co", "TiYgvQDskXc", "Gfcnrruuxo0", "jAWvHwVw6pM", "GgUewlir9hQ", "tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "_IGhldbQ0U8", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I", "ymLi_dodpiQ", "YNzmfWFWXds", "5zUDyjvn9Bs", "kvVW1XLcCMA", "o_LwMOM2jOM", "JiESNlJwEzs", "PF1-mq14TC8", "8EaYsPdOCzE"], "quotaCost": 1, "timestamp": "2025-05-09T10:01:13.564Z", "requestType": "videos.list"}	f	2025-05-09 10:01:13.564
512	api_response	API Response at 2025-05-09T10:01:13.826Z - Received 38/38 videos in 242ms	1	{"timestamp": "2025-05-09T10:01:13.826Z", "quotaUsage": 1, "responseTime": 242, "videosReceived": 38, "videoIdsRequested": 38}	f	2025-05-09 10:01:13.826
513	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:01:24.557
514	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:01:14.005Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-09 10:01:24.577
515	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-09T10:31:15.005Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T10:31:15.005Z", "nextCheckMinutes": 30}	f	2025-05-09 10:01:24.597
516	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:02:13.529
517	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:01:14.005Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-09 10:02:13.553
518	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-09T10:31:15.005Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T10:31:15.005Z", "nextCheckMinutes": 30}	f	2025-05-09 10:02:13.57
519	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:05:16.329
520	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:01:14.005Z", "elapsedMinutes": 4, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 26}]}	f	2025-05-09 10:05:16.359
521	scheduler_check	Next check scheduled for campaign 1 in 26 minutes at 2025-05-09T10:31:15.005Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T10:31:15.005Z", "nextCheckMinutes": 26}	f	2025-05-09 10:05:16.386
522	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:22:55.175
523	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:01:14.005Z", "elapsedMinutes": 21, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 9}]}	f	2025-05-09 10:22:55.206
524	scheduler_check	Next check scheduled for campaign 1 in 9 minutes at 2025-05-09T10:31:15.005Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T10:31:15.005Z", "nextCheckMinutes": 9}	f	2025-05-09 10:22:55.223
525	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:24:25.124
526	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:01:14.005Z", "elapsedMinutes": 23, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 7}]}	f	2025-05-09 10:24:25.142
527	scheduler_check	Next check scheduled for campaign 1 in 7 minutes at 2025-05-09T10:31:15.005Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T10:31:15.005Z", "nextCheckMinutes": 7}	f	2025-05-09 10:24:25.165
528	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:31:19.279
529	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:01:14.005Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-09 10:31:19.319
530	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-09 10:31:19.34
531	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-09 10:31:19.382
532	interval_check	Campaign 1: Last check: 2025-05-09T10:01:14.005Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-09T10:01:14.005Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-09 10:31:19.402
533	api_request	API Request at 2025-05-09T10:31:19.464Z - 35 videos: vpy11yVtMpQ, PyzwgvLNojQ, enycSwZAFaY, rxtjef7W2-4, TiYgvQDskXc... (and 30 more)	1	{"videoIds": ["vpy11yVtMpQ", "PyzwgvLNojQ", "enycSwZAFaY", "rxtjef7W2-4", "TiYgvQDskXc", "Gfcnrruuxo0", "GgUewlir9hQ", "tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "_IGhldbQ0U8", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I", "ymLi_dodpiQ", "YNzmfWFWXds", "kvVW1XLcCMA", "o_LwMOM2jOM", "8EaYsPdOCzE"], "quotaCost": 1, "timestamp": "2025-05-09T10:31:19.464Z", "requestType": "videos.list"}	f	2025-05-09 10:31:19.464
534	api_response	API Response at 2025-05-09T10:31:19.670Z - Received 35/35 videos in 185ms	1	{"timestamp": "2025-05-09T10:31:19.670Z", "quotaUsage": 1, "responseTime": 185, "videosReceived": 35, "videoIdsRequested": 35}	f	2025-05-09 10:31:19.67
535	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:31:24.75
536	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-09 10:31:24.769
538	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:32:20.657
539	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 1, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 29}]}	f	2025-05-09 10:32:20.676
540	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 30}	f	2025-05-09 10:32:20.694
541	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:33:50.636
542	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 2, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 28}]}	f	2025-05-09 10:33:50.656
543	scheduler_check	Next check scheduled for campaign 1 in 28 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 28}	f	2025-05-09 10:33:50.701
544	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:35:57.204
545	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 4, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 26}]}	f	2025-05-09 10:35:57.225
546	scheduler_check	Next check scheduled for campaign 1 in 26 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 26}	f	2025-05-09 10:35:57.245
547	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:36:52.574
548	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 5, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 25}]}	f	2025-05-09 10:36:52.631
549	scheduler_check	Next check scheduled for campaign 1 in 25 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 25}	f	2025-05-09 10:36:52.652
550	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:37:22.924
551	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 6, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 24}]}	f	2025-05-09 10:37:22.947
552	scheduler_check	Next check scheduled for campaign 1 in 24 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 24}	f	2025-05-09 10:37:22.968
553	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:37:46.416
554	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 6, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 24}]}	f	2025-05-09 10:37:46.438
555	scheduler_check	Next check scheduled for campaign 1 in 24 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 24}	f	2025-05-09 10:37:46.459
556	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:39:27.416
557	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 8, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 22}]}	f	2025-05-09 10:39:27.441
558	scheduler_check	Next check scheduled for campaign 1 in 22 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 22}	f	2025-05-09 10:39:27.459
559	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:40:08.547
560	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 8, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 22}]}	f	2025-05-09 10:40:08.571
561	scheduler_check	Next check scheduled for campaign 1 in 22 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 22}	f	2025-05-09 10:40:08.605
562	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:40:23.29
563	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 9, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 21}]}	f	2025-05-09 10:40:23.316
564	scheduler_check	Next check scheduled for campaign 1 in 21 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 21}	f	2025-05-09 10:40:23.336
565	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:41:28.24
566	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 10, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 20}]}	f	2025-05-09 10:41:28.259
567	scheduler_check	Next check scheduled for campaign 1 in 20 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 20}	f	2025-05-09 10:41:28.276
568	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:44:03.222
569	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 12, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 18}]}	f	2025-05-09 10:44:03.248
570	scheduler_check	Next check scheduled for campaign 1 in 18 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 18}	f	2025-05-09 10:44:03.269
571	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:44:10.953
572	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 12, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 18}]}	f	2025-05-09 10:44:10.974
573	scheduler_check	Next check scheduled for campaign 1 in 18 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 18}	f	2025-05-09 10:44:11.001
574	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:45:14.124
575	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 13, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 17}]}	f	2025-05-09 10:45:14.144
576	scheduler_check	Next check scheduled for campaign 1 in 17 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 17}	f	2025-05-09 10:45:14.163
577	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:52:55.714
578	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 21, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 9}]}	f	2025-05-09 10:52:55.735
579	scheduler_check	Next check scheduled for campaign 1 in 9 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 9}	f	2025-05-09 10:52:55.752
580	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:58:09.239
581	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 26, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 4}]}	f	2025-05-09 10:58:09.259
582	scheduler_check	Next check scheduled for campaign 1 in 4 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 4}	f	2025-05-09 10:58:09.277
583	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 10:58:20.543
584	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 27, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 3}]}	f	2025-05-09 10:58:20.56
585	scheduler_check	Next check scheduled for campaign 1 in 4 minutes at 2025-05-09T11:01:20.691Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:01:20.691Z", "nextCheckMinutes": 4}	f	2025-05-09 10:58:20.576
586	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 11:01:20.759
587	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-09 11:01:20.779
588	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-09 11:01:20.797
589	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-09 11:01:20.833
590	interval_check	Campaign 1: Last check: 2025-05-09T10:31:19.691Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-09T10:31:19.691Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-09 11:01:20.852
591	api_request	API Request at 2025-05-09T11:01:20.910Z - 35 videos: vpy11yVtMpQ, PyzwgvLNojQ, enycSwZAFaY, rxtjef7W2-4, TiYgvQDskXc... (and 30 more)	1	{"videoIds": ["vpy11yVtMpQ", "PyzwgvLNojQ", "enycSwZAFaY", "rxtjef7W2-4", "TiYgvQDskXc", "Gfcnrruuxo0", "GgUewlir9hQ", "tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "_IGhldbQ0U8", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I", "ymLi_dodpiQ", "YNzmfWFWXds", "kvVW1XLcCMA", "o_LwMOM2jOM", "8EaYsPdOCzE"], "quotaCost": 1, "timestamp": "2025-05-09T11:01:20.910Z", "requestType": "videos.list"}	f	2025-05-09 11:01:20.91
592	api_response	API Response at 2025-05-09T11:01:21.219Z - Received 35/35 videos in 290ms	1	{"timestamp": "2025-05-09T11:01:21.219Z", "quotaUsage": 1, "responseTime": 290, "videosReceived": 35, "videoIdsRequested": 35}	f	2025-05-09 11:01:21.219
593	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 11:01:26.299
594	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T11:01:21.237Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-09 11:01:26.32
595	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-09T11:31:22.237Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:31:22.237Z", "nextCheckMinutes": 30}	f	2025-05-09 11:01:26.348
596	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 11:17:03.228
597	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T11:01:21.237Z", "elapsedMinutes": 15, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 15}]}	f	2025-05-09 11:17:03.3
598	scheduler_check	Next check scheduled for campaign 1 in 15 minutes at 2025-05-09T11:31:22.237Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:31:22.237Z", "nextCheckMinutes": 15}	f	2025-05-09 11:17:03.331
599	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 11:17:58.72
600	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T11:01:21.237Z", "elapsedMinutes": 16, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 14}]}	f	2025-05-09 11:17:58.745
601	scheduler_check	Next check scheduled for campaign 1 in 14 minutes at 2025-05-09T11:31:22.237Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T11:31:22.237Z", "nextCheckMinutes": 14}	f	2025-05-09 11:17:58.763
602	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 11:31:22.319
603	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T11:01:21.237Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-09 11:31:22.339
604	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-09 11:31:22.358
605	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-09 11:31:22.468
606	interval_check	Campaign 1: Last check: 2025-05-09T11:01:21.237Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-09T11:01:21.237Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-09 11:31:22.486
607	api_request	API Request at 2025-05-09T11:31:22.541Z - 35 videos: vpy11yVtMpQ, PyzwgvLNojQ, enycSwZAFaY, rxtjef7W2-4, TiYgvQDskXc... (and 30 more)	1	{"videoIds": ["vpy11yVtMpQ", "PyzwgvLNojQ", "enycSwZAFaY", "rxtjef7W2-4", "TiYgvQDskXc", "Gfcnrruuxo0", "GgUewlir9hQ", "tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "_IGhldbQ0U8", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I", "ymLi_dodpiQ", "YNzmfWFWXds", "kvVW1XLcCMA", "o_LwMOM2jOM", "8EaYsPdOCzE"], "quotaCost": 1, "timestamp": "2025-05-09T11:31:22.541Z", "requestType": "videos.list"}	f	2025-05-09 11:31:22.541
608	api_response	API Response at 2025-05-09T11:31:22.833Z - Received 35/35 videos in 274ms	1	{"timestamp": "2025-05-09T11:31:22.833Z", "quotaUsage": 1, "responseTime": 274, "videosReceived": 35, "videoIdsRequested": 35}	f	2025-05-09 11:31:22.833
609	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 11:31:27.889
610	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T11:31:22.851Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-09 11:31:27.907
611	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-09T12:01:23.851Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T12:01:23.851Z", "nextCheckMinutes": 30}	f	2025-05-09 11:31:27.925
612	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 11:34:10.491
613	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T11:31:22.851Z", "elapsedMinutes": 2, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 28}]}	f	2025-05-09 11:34:10.508
614	scheduler_check	Next check scheduled for campaign 1 in 28 minutes at 2025-05-09T12:01:23.851Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T12:01:23.851Z", "nextCheckMinutes": 28}	f	2025-05-09 11:34:10.526
615	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 11:43:06.421
616	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T11:31:22.851Z", "elapsedMinutes": 11, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 19}]}	f	2025-05-09 11:43:06.438
617	scheduler_check	Next check scheduled for campaign 1 in 19 minutes at 2025-05-09T12:01:23.851Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T12:01:23.851Z", "nextCheckMinutes": 19}	f	2025-05-09 11:43:06.455
618	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 12:01:24.022
619	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T11:31:22.851Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-09 12:01:24.042
620	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-09 12:01:24.061
621	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-09 12:01:24.104
622	interval_check	Campaign 1: Last check: 2025-05-09T11:31:22.851Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-09T11:31:22.851Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-09 12:01:24.126
623	api_request	API Request at 2025-05-09T12:01:24.188Z - 35 videos: vpy11yVtMpQ, PyzwgvLNojQ, enycSwZAFaY, rxtjef7W2-4, TiYgvQDskXc... (and 30 more)	1	{"videoIds": ["vpy11yVtMpQ", "PyzwgvLNojQ", "enycSwZAFaY", "rxtjef7W2-4", "TiYgvQDskXc", "Gfcnrruuxo0", "GgUewlir9hQ", "tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "_IGhldbQ0U8", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I", "ymLi_dodpiQ", "YNzmfWFWXds", "kvVW1XLcCMA", "o_LwMOM2jOM", "8EaYsPdOCzE"], "quotaCost": 1, "timestamp": "2025-05-09T12:01:24.188Z", "requestType": "videos.list"}	f	2025-05-09 12:01:24.188
624	api_response	API Response at 2025-05-09T12:01:24.412Z - Received 35/35 videos in 204ms	1	{"timestamp": "2025-05-09T12:01:24.412Z", "quotaUsage": 1, "responseTime": 204, "videosReceived": 35, "videoIdsRequested": 35}	f	2025-05-09 12:01:24.412
625	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 12:01:29.472
626	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T12:01:24.432Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-09 12:01:29.495
627	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-09T12:31:25.432Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T12:31:25.432Z", "nextCheckMinutes": 30}	f	2025-05-09 12:01:29.516
628	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 12:27:45.38
629	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T12:01:24.432Z", "elapsedMinutes": 26, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 4}]}	f	2025-05-09 12:27:45.399
630	scheduler_check	Next check scheduled for campaign 1 in 4 minutes at 2025-05-09T12:31:25.432Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T12:31:25.432Z", "nextCheckMinutes": 4}	f	2025-05-09 12:27:45.417
631	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 12:31:25.566
632	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T12:01:24.432Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-09 12:31:25.586
633	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-09 12:31:25.606
634	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-09 12:31:25.642
635	interval_check	Campaign 1: Last check: 2025-05-09T12:01:24.432Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-09T12:01:24.432Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-09 12:31:25.663
636	api_request	API Request at 2025-05-09T12:31:25.723Z - 36 videos: vpy11yVtMpQ, PyzwgvLNojQ, enycSwZAFaY, rxtjef7W2-4, TiYgvQDskXc... (and 31 more)	1	{"videoIds": ["vpy11yVtMpQ", "PyzwgvLNojQ", "enycSwZAFaY", "rxtjef7W2-4", "TiYgvQDskXc", "Gfcnrruuxo0", "GgUewlir9hQ", "tNx-YeEYFE4", "BaCQqVIpMAU", "6mtvyafkl-c", "jDq-gvwrptQ", "_IGhldbQ0U8", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I", "ymLi_dodpiQ", "YNzmfWFWXds", "kvVW1XLcCMA", "o_LwMOM2jOM", "8EaYsPdOCzE"], "quotaCost": 1, "timestamp": "2025-05-09T12:31:25.723Z", "requestType": "videos.list"}	f	2025-05-09 12:31:25.723
637	api_response	API Response at 2025-05-09T12:31:25.943Z - Received 36/36 videos in 203ms	1	{"timestamp": "2025-05-09T12:31:25.943Z", "quotaUsage": 1, "responseTime": 203, "videosReceived": 36, "videoIdsRequested": 36}	f	2025-05-09 12:31:25.943
638	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 12:31:31.069
639	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T12:31:26.032Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-09 12:31:31.086
640	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-09T13:01:27.032Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T13:01:27.032Z", "nextCheckMinutes": 30}	f	2025-05-09 12:31:31.104
641	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 12:32:47.548
642	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T12:31:26.032Z", "elapsedMinutes": 1, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 29}]}	f	2025-05-09 12:32:47.569
643	scheduler_check	Next check scheduled for campaign 1 in 29 minutes at 2025-05-09T13:01:27.032Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T13:01:27.032Z", "nextCheckMinutes": 29}	f	2025-05-09 12:32:47.589
644	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 13:01:27.164
645	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T12:31:26.032Z", "elapsedMinutes": 30, "intervalMinutes": 30, "needsProcessing": true, "remainingMinutes": 0}]}	f	2025-05-09 13:01:27.192
646	scheduler_check	Processing 1 campaigns now: 1	\N	{"campaignsNeedingProcess": [1]}	f	2025-05-09 13:01:27.207
647	interval_check	Scheduler checking 1 campaigns with YouTube API enabled	\N	{"campaignIds": [1]}	f	2025-05-09 13:01:27.24
648	interval_check	Campaign 1: Last check: 2025-05-09T12:31:26.032Z, Interval: 30 minutes, Time remaining: 0 minutes	1	{"name": "Test", "lastCheck": "2025-05-09T12:31:26.032Z", "shouldProcess": true, "elapsedMinutes": 30, "intervalMinutes": 30, "minutesRemaining": 0}	f	2025-05-09 13:01:27.258
649	api_request	API Request at 2025-05-09T13:01:27.314Z - 36 videos: vpy11yVtMpQ, PyzwgvLNojQ, enycSwZAFaY, rxtjef7W2-4, TiYgvQDskXc... (and 31 more)	1	{"videoIds": ["vpy11yVtMpQ", "PyzwgvLNojQ", "enycSwZAFaY", "rxtjef7W2-4", "TiYgvQDskXc", "PyzwgvLNojQ", "Gfcnrruuxo0", "GgUewlir9hQ", "tNx-YeEYFE4", "BaCQqVIpMAU", "jDq-gvwrptQ", "_IGhldbQ0U8", "op1XBM69HZY", "TOAllkhdHi4", "qiLpTt7RZxs", "DqJU_r8_QNk", "RzbJymJSrO8", "xhA-lfYmSnM", "0Jk175TH3EE", "VCR9OKBzcos", "B0rKqznqCtY", "LLipm4EfPhE", "oulBLD_CmnY", "op1XBM69HZY", "0u7HpXFpfOU", "ggb-QuNTHxQ", "jsaKhHi48oE", "WoE6d-bWOq8", "Ej_KqAol2ag", "PSo-Npr-Vu8", "-4SsNgYY00I", "ymLi_dodpiQ", "YNzmfWFWXds", "kvVW1XLcCMA", "o_LwMOM2jOM", "8EaYsPdOCzE"], "quotaCost": 1, "timestamp": "2025-05-09T13:01:27.314Z", "requestType": "videos.list"}	f	2025-05-09 13:01:27.314
650	api_response	API Response at 2025-05-09T13:01:27.482Z - Received 36/36 videos in 152ms	1	{"timestamp": "2025-05-09T13:01:27.482Z", "quotaUsage": 1, "responseTime": 152, "videosReceived": 36, "videoIdsRequested": 36}	f	2025-05-09 13:01:27.482
651	scheduler_check	Calculating next check time for 1 campaigns	\N	{"campaignCount": 1}	f	2025-05-09 13:01:32.533
652	scheduler_check	Campaign timing details	\N	{"campaignTimings": [{"id": 1, "name": "Test", "lastCheck": "2025-05-09T13:01:27.499Z", "elapsedMinutes": 0, "intervalMinutes": 30, "needsProcessing": false, "remainingMinutes": 30}]}	f	2025-05-09 13:01:32.548
653	scheduler_check	Next check scheduled for campaign 1 in 30 minutes at 2025-05-09T13:31:28.499Z	1	{"campaignInfo": {"id": 1, "name": "Test", "intervalMinutes": 30}, "nextCheckTime": "2025-05-09T13:31:28.499Z", "nextCheckMinutes": 30}	f	2025-05-09 13:01:32.564
\.


--
-- Data for Name: youtube_url_records; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.youtube_url_records (id, url_id, campaign_id, name, target_url, youtube_video_id, deletion_reason, country_restricted, private_video, deleted_video, age_restricted, made_for_kids, deleted_at, created_at, exceeded_duration) FROM stdin;
1	1	1	63810593	https://www.youtube.com/watch?v=c49p32BfEEM	c49p32BfEEM	Video exceeds maximum duration (121 minutes)	f	f	f	f	f	2025-05-07 16:53:56.554	2025-05-07 16:53:56.554	t
2	13	1	63811752	https://www.youtube.com/watch?v=kmBnCr3Yd-o	kmBnCr3Yd-o	Video exceeds maximum duration (57 minutes)	f	f	f	f	f	2025-05-08 05:17:55.365	2025-05-08 05:17:55.365	t
3	16	1	63812486	https://www.youtube.com/watch?v=TS1BShujgOo	TS1BShujgOo	Video exceeds maximum duration (32 minutes)	f	f	f	f	f	2025-05-08 05:17:55.449	2025-05-08 05:17:55.449	t
4	46	1	wwws	https://www.youtube.com/watch?v=TS1BShujgOo	TS1BShujgOo	Video exceeds maximum duration (32 minutes)	f	f	f	f	f	2025-05-08 10:22:43.44	2025-05-08 10:22:43.44	t
5	\N	1	2wqwq	https://www.youtube.com/watch?v=c49p32BfEEM	c49p32BfEEM	[Direct Rejected] Video exceeds maximum duration (121 minutes)	f	f	f	f	f	2025-05-08 12:39:00.077	2025-05-08 12:39:00.077	t
6	52	1	ryfyhgvjvjn	https://www.youtube.com/watch?v=c49p32BfEEM	c49p32BfEEM	Video exceeds maximum duration (121 minutes)	f	f	f	f	f	2025-05-08 12:46:00.365	2025-05-08 12:46:00.365	t
7	53	1	wdwsfs	https://www.youtube.com/watch?v=c49p32BfEEM	c49p32BfEEM	Video exceeds maximum duration (121 minutes)	f	f	f	f	f	2025-05-08 12:52:42.638	2025-05-08 12:52:42.638	t
8	54	1	sfs	https://www.youtube.com/watch?v=c49p32BfEEM	c49p32BfEEM	Video exceeds maximum duration (121 minutes)	f	f	f	f	f	2025-05-08 13:25:50.318	2025-05-08 13:25:50.318	t
9	55	1	jfjy	https://www.youtube.com/watch?v=pJkLbSwgWsU	pJkLbSwgWsU	Video not found (deleted or unavailable)	f	f	t	f	f	2025-05-08 13:55:52.142	2025-05-08 13:55:52.142	f
10	29	1	63816575	https://www.youtube.com/watch?v=_MlzedR1VW8	_MlzedR1VW8	Age restricted video	f	f	f	t	f	2025-05-08 16:06:50.097	2025-05-08 16:06:50.097	f
11	118	1	63823410	https://www.youtube.com/watch?v=Av5j-QLO7co	Av5j-QLO7co	Video made for kids	f	f	f	f	t	2025-05-09 10:01:13.845	2025-05-09 10:01:13.845	f
14	117	1	63823411	https://www.youtube.com/watch?v=jAWvHwVw6pM	jAWvHwVw6pM	Video made for kids	f	f	f	f	t	2025-05-09 10:01:13.845	2025-05-09 10:01:13.845	f
12	112	1	63824065	https://www.youtube.com/watch?v=JiESNlJwEzs	JiESNlJwEzs	Video restricted in India	t	f	f	f	f	2025-05-09 10:01:13.845	2025-05-09 10:01:13.845	f
13	121	1	63826887	https://www.youtube.com/watch?v=5zUDyjvn9Bs	5zUDyjvn9Bs	Video exceeds maximum duration (90 minutes)	f	f	f	f	f	2025-05-09 10:01:13.845	2025-05-09 10:01:13.845	t
15	115	1	63823402	https://www.youtube.com/watch?v=PF1-mq14TC8	PF1-mq14TC8	Video made for kids	f	f	f	f	t	2025-05-09 10:01:13.845	2025-05-09 10:01:13.845	f
16	152	1	63829740	https://www.youtube.com/watch?v=6mtvyafkl-c	6mtvyafkl-c	Video exceeds maximum duration (128 minutes)	f	f	f	f	f	2025-05-09 12:31:25.963	2025-05-09 12:31:25.963	t
\.


--
-- Name: api_error_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.api_error_logs_id_seq', 16, true);


--
-- Name: campaign_click_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.campaign_click_records_id_seq', 18, true);


--
-- Name: campaign_monitoring_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.campaign_monitoring_id_seq', 1, true);


--
-- Name: campaign_redirect_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.campaign_redirect_logs_id_seq', 109, true);


--
-- Name: campaigns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.campaigns_id_seq', 2, true);


--
-- Name: click_analytics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.click_analytics_id_seq', 8710, true);


--
-- Name: click_protection_test_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.click_protection_test_id_seq', 4, true);


--
-- Name: gmail_campaign_assignments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.gmail_campaign_assignments_id_seq', 2, true);


--
-- Name: original_url_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.original_url_records_id_seq', 160, true);


--
-- Name: sync_operations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.sync_operations_id_seq', 3, true);


--
-- Name: system_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.system_settings_id_seq', 4, true);


--
-- Name: trafficstar_campaigns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.trafficstar_campaigns_id_seq', 1, false);


--
-- Name: trafficstar_credentials_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.trafficstar_credentials_id_seq', 1, true);


--
-- Name: url_click_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.url_click_logs_id_seq', 33, true);


--
-- Name: url_click_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.url_click_records_id_seq', 1, false);


--
-- Name: urls_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.urls_id_seq', 158, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: youtube_api_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.youtube_api_logs_id_seq', 653, true);


--
-- Name: youtube_url_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.youtube_url_records_id_seq', 16, true);


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
-- Name: campaign_monitoring campaign_monitoring_campaign_id_type_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaign_monitoring
    ADD CONSTRAINT campaign_monitoring_campaign_id_type_key UNIQUE (campaign_id, type);


--
-- Name: campaign_monitoring campaign_monitoring_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.campaign_monitoring
    ADD CONSTRAINT campaign_monitoring_pkey PRIMARY KEY (id);


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
-- Name: gmail_campaign_assignments gmail_campaign_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.gmail_campaign_assignments
    ADD CONSTRAINT gmail_campaign_assignments_pkey PRIMARY KEY (id);


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
-- Name: system_settings system_settings_name_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_name_key UNIQUE (name);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


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
-- Name: youtube_api_logs youtube_api_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.youtube_api_logs
    ADD CONSTRAINT youtube_api_logs_pkey PRIMARY KEY (id);


--
-- Name: youtube_url_records youtube_url_records_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.youtube_url_records
    ADD CONSTRAINT youtube_url_records_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "IDX_session_expire" ON public.sessions USING btree (expire);


--
-- Name: gmail_campaign_assignments_campaign_id_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX gmail_campaign_assignments_campaign_id_idx ON public.gmail_campaign_assignments USING btree (campaign_id);


--
-- Name: gmail_campaign_assignments_quantity_range_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX gmail_campaign_assignments_quantity_range_idx ON public.gmail_campaign_assignments USING btree (min_click_quantity, max_click_quantity);


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
-- Name: gmail_campaign_assignments gmail_campaign_assignments_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.gmail_campaign_assignments
    ADD CONSTRAINT gmail_campaign_assignments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id);


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
-- Name: youtube_api_logs youtube_api_logs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.youtube_api_logs
    ADD CONSTRAINT youtube_api_logs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: youtube_url_records youtube_url_records_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.youtube_url_records
    ADD CONSTRAINT youtube_url_records_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id);


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

